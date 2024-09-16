package au.csiro.data61.magda.indexer.search.elasticsearch

import java.time.{Instant, OffsetDateTime}
import akka.NotUsed
import akka.actor.{ActorSystem, Scheduler}
import akka.stream.scaladsl.{Sink, Source, SourceQueue}
import akka.stream.{Materializer, OverflowStrategy, QueueOfferResult}
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.indexer.search.SearchIndexer.IndexResult
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.search.elasticsearch.Exceptions._
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.util.ErrorHandling.retry
import com.sksamuel.elastic4s.requests.admin.OpenIndexRequest
import com.sksamuel.elastic4s.requests.bulk.BulkRequest
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.bulk.{BulkResponse, BulkResponseItem}
import com.sksamuel.elastic4s.requests.delete.DeleteByQueryResponse
import com.sksamuel.elastic4s.requests.indexes.CreateIndexResponse
import com.sksamuel.elastic4s.requests.indexes.admin.RefreshIndexResponse
import com.sksamuel.elastic4s.requests.indexes.IndexMappings
import com.sksamuel.elastic4s.requests.searches.SearchResponse
import com.sksamuel.elastic4s.requests.snapshots.{
  CreateSnapshotResponse,
  GetSnapshotResponse,
  RestoreSnapshotResponse,
  Snapshot
}
import com.sksamuel.elastic4s.{
  ElasticClient,
  ElasticDsl,
  RequestFailure,
  RequestSuccess
}
import com.sksamuel.elastic4s.requests.indexes.IndexRequest
import com.sksamuel.elastic4s.requests.snapshots._
import com.typesafe.config.Config
import spray.json._

import scala.collection.JavaConverters._
import scala.collection.mutable.ListBuffer
import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future, Promise}

class ElasticSearchIndexer(
    val clientProvider: ClientProvider,
    val indices: Indices
)(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val materializer: Materializer
) extends SearchIndexer {
  private val logger = system.log
  private val SNAPSHOT_REPO_NAME = "snapshots"

  private val indexingBufferSize = config.getInt("indexer.indexingBufferSize")
  private val indexingQueueBufferSize = Int.MaxValue
  private val indexingMaxBatchSize =
    config.getInt("indexer.indexingMaxBatchSize")
  private val indexingInitialBatchDelayMs =
    config.getInt("indexer.indexingInitialBatchDelayMs").milliseconds

  /**
    * Returns an initialised ElasticClient on completion. Using this to get the client rather than just keeping a reference to an initialised client
    *  ensures that all queries will only complete after the client is initialised.
    */
  private val setupFuture = setup().map { r =>
    isReady = true
    r
  }

  implicit val scheduler: Scheduler = system.scheduler

  def ready: Future[Unit] = setupFuture.map(_ => Unit)

  var isReady: Boolean = false

  private lazy val restoreQueue: SourceQueue[
    (ElasticClient, IndexDefinition, Snapshot, Promise[RestoreResult])
  ] =
    Source
      .queue[
        (ElasticClient, IndexDefinition, Snapshot, Promise[RestoreResult])
      ](indexingQueueBufferSize, OverflowStrategy.backpressure)
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info(
            "Restoring snapshot {} for {} version {}",
            snapshot.snapshot,
            definition.name,
            definition.version
          )

          logger.info("First deleting existing index if present...")

          deleteIndex(client, definition).map(
            _ => (client, definition, snapshot, promise)
          )
      }
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info("Restoring snapshot into {}", definition.name)

          client.execute {
            RestoreSnapshotRequest(
              snapshotName = snapshot.snapshot,
              repositoryName = SNAPSHOT_REPO_NAME,
              indices = indices.getIndex(config, definition.indicesIndex),
              // --- As of elastic4s 6.5.1, `waitForCompletion` is actually not sent as part of request
              waitForCompletion = Some(true)
            )
          } map {
            case r: RequestSuccess[RestoreSnapshotResponse] =>
              logger.info(
                "Restored {} version {}",
                definition.name,
                definition.version
              )
              Thread.sleep(5000)
              (client, definition, RestoreSuccess)
            case f: RequestFailure =>
              logger.info(
                "Failed to restore for {} version {} with status {}",
                definition.name,
                definition.version,
                f.status.toString
              )
              RestoreFailure
          }
      }
      .mapAsync(1) {
        case RestoreFailure => Future.successful(RestoreFailure)
        case (
            client: ElasticClient,
            definition: IndexDefinition,
            RestoreSuccess
            ) =>
          val indexName = indices.getIndex(config, definition.indicesIndex)
          retry(
            () => {
              logger.info("Checking whether index {} is ready...", indexName)
              client
                .execute(ElasticDsl.search(indexName).size(0))
                .flatMap {
                  case results: RequestSuccess[SearchResponse] =>
                    logger.info("Index {} is ready!", indexName)
                    Future.successful(true)
                  case ESGenericException(e) => throw e
                }
            },
            30 seconds,
            3,
            (retiresCount: Int, e: Throwable) => {
              logger.error(
                "Index {} is not ready, {} retries left. Reason: {}",
                indexName,
                retiresCount,
                e
              )
              e match {
                case ESException(f, m) =>
                  f match {
                    case IndexCloseException(e) =>
                      client.execute(OpenIndexRequest(indexName))
                  }
              }
            }
          )
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when restoring: {}", e.getMessage)
      }
      .to(Sink.last)
      .run()

  /** Initialises an ElasticClient, handling initial connection to the ElasticSearch server and creation of the indices */
  private def setup(): Future[ElasticClient] = {
    clientProvider.getClient
      .flatMap(
        client =>
          retry(
            () => getIndexDefinitions(client),
            30 seconds,
            config.getInt("indexer.connectionRetries"),
            (retries: Int, e: Throwable) => {
              logger.error(
                "Failed to get indexes, {} retries left, reason: {}",
                retries,
                e
              )
              e match {
                case ESException(failure, message) =>
                  failure match {
                    case IndexCloseException(e) =>
                      failure.error.index match {
                        case Some(idxName) =>
                          logger.info(
                            "Index {} is closed, try to reopen it...",
                            idxName
                          )
                          client.execute(OpenIndexRequest(idxName))
                        case None =>
                          logger.info("Unknown index is closed, do nothing.")
                      }
                  }
              }
            }
          ).flatMap { indexPairs =>
            updateIndices(client, indexPairs)
              .map { _ =>
                // If we've got to here everything has gone swimmingly - the index is all ready to have data loaded, so return the client for other methods to play with :)
                client
              }
          }
      )
      .recover {
        case t: Throwable =>
          logger.error(
            t,
            "Could not connect to elasticsearch - this is a fatal error, so I'm dying now."
          )
          System.exit(1)
          throw t
      }
  }

  private def tryReindexSpatialFail(
      dataSet: DataSet,
      result: Seq[BulkResponseItem],
      promise: Promise[Unit]
  ): Boolean = {
    // The dataset result is always the first
    val geoFail = result.head.error.isDefined && result.head.error.exists(
      _.reason.contains("failed to parse field [spatial.geoJson]")
    )

    if (geoFail) {
      logger.info(
        "Excluded dataset {} due to bad geojson - trying these again with spatial.geoJson excluded",
        dataSet.identifier
      )
      val dataSetWithoutSpatial = dataSet.copy(
        spatial = dataSet.spatial.map(spatial => spatial.copy(geoJson = None))
      )

      performIndex(Source(List((dataSetWithoutSpatial, promise))), false)

      true
    } else {
      false
    }
  }

  private def tryReindexDynamicMappingTimeoutFail(
      dataSet: DataSet,
      result: Seq[BulkResponseItem],
      promise: Promise[Unit]
  ): Boolean = {
    val hasMappingTimeoutError = result.exists(
      _.error.exists(
        _.reason
          .contains("timed out while waiting for a dynamic mapping update")
      )
    )

    if (hasMappingTimeoutError) {
      logger.info(
        "Retry index dataset due to dynamic mapping update timeout error. Dataset: {}",
        dataSet.identifier
      )

      performIndex(Source(List((dataSet, promise))), false)

      true
    } else {
      false
    }
  }

  /**
    * Returns a future that gets a seq of each index paired with its current ES definition.
    */
  private def getIndexDefinitions(client: ElasticClient) = {
    def indexNotFound(indexDef: IndexDefinition, inner: RuntimeException) = {
      logger.info(
        "{} index was not present, if this is the first boot with a new index version this is fine: {}",
        indexDef.name,
        inner.getMessage
      )
      None
    }

    val futures = IndexDefinition.indices.map(
      indexDef =>
        client
          .execute(
            ElasticDsl
              .getMapping(indices.getIndex(config, indexDef.indicesIndex))
          )
          .flatMap {
            case results: RequestSuccess[Seq[IndexMappings]] =>
              // --- As es 6.5.1, es may set an index to `close` after recovery
              // --- we need to check this before assume index is ready
              client
                .execute(
                  ElasticDsl
                    .search(indices.getIndex(config, indexDef.indicesIndex))
                    .size(0)
                )
                .map {
                  case searchResults: RequestSuccess[SearchResponse] =>
                    Some(results.result)
                  case ESGenericException(e) => throw e
                }
            case IndexNotFoundException(e) =>
              // If the index wasn't found that's fine, we'll just recreate it. Otherwise log an error - every subsequent request to the provider will fail with this exception.
              Future.successful(indexNotFound(indexDef, e))
            case ESGenericException(e) =>
              logger.error(
                "failed to get {} index, error: {}",
                indexDef.name,
                e.getMessage
              )
              Future.successful(None)
          }
    )
    Future
      .sequence(futures)
      .map(_.zip(IndexDefinition.indices))
  }

  private def updateIndices(
      client: ElasticClient,
      definitionPairs: Seq[(Option[Seq[IndexMappings]], IndexDefinition)]
  ): Future[Object] =
    Future.sequence(definitionPairs.map {
      case (mappings, definition) =>
        // If no index, create it
        mappings match {
          case Some(_) =>
            logger.info(
              "{} index version {} already exists",
              definition.name,
              definition.version
            )
            Future.successful(Unit)
          case None =>
            logger.info(
              "{} index version {} does not exist, creating",
              definition.name,
              definition.version
            )
            buildIndex(client, definition)
        }
    })

  private def buildIndex(
      client: ElasticClient,
      definition: IndexDefinition
  ): Future[Any] = {
    val snapshotFuture =
      if (config.getBoolean("indexer.readSnapshots"))
        restoreLatestSnapshot(client, definition)
      else {
        logger.info("Snapshot restoration disabled, rebuilding index manually")
        Future(RestoreFailure)
      }

    def processingDefinitionCreateHandler() = {
      definition.create match {
        case Some(createFunc) =>
          createFunc(client, indices, config)(materializer, system)
            .flatMap(_ => {
              createSnapshot(client, definition)
            })
        case None => Future(Unit)
      }
    }

    snapshotFuture flatMap {
      case RestoreSuccess => Future.successful(Unit) // no need to reindex
      case RestoreFailure =>
        deleteIndex(client, definition)
          .flatMap { _ =>
            client.execute(definition.definition(indices, config))
          } recover {
          case e: Throwable =>
            logger.error(e, "Failed to set up the index")
            throw e
        } flatMap {
          case r: RequestSuccess[CreateIndexResponse] =>
            logger.info(
              "Index {} version {} created",
              definition.name,
              definition.version
            )

            processingDefinitionCreateHandler()

          case ResourceAlreadyExistsException(e) =>
            logger.info(
              "Index {} version {} has already been created. ",
              definition.name,
              definition.version
            )

            processingDefinitionCreateHandler()

          case ESGenericException(e) =>
            logger.error(e, "Failed to set up the index")
            throw e
        }
    }
  }

  def deleteIndex(
      client: ElasticClient,
      definition: IndexDefinition
  ): Future[Unit] =
    client
      .execute {
        ElasticDsl.deleteIndex(
          indices.getIndex(config, definition.indicesIndex)
        )
      }
      .map {
        case IndexNotFoundException(e) => // Meh, we were trying to delete it anyway.
        case ESGenericException(e)     => throw e
        case _                         => Unit
      }
      .recover {
        case e: Throwable =>
          logger.debug("Exception class {}", e.getClass.toString)
          throw e
      }
      .map { _ =>
        Unit
      }

  def isEmpty(index: Indices.Index): Future[Boolean] = {
    for {
      client <- setupFuture
      result <- client.execute(
        ElasticDsl.search(indices.getIndex(config, index))
      )
    } yield
      result match {
        case r: RequestSuccess[SearchResponse] => r.result.isEmpty
        case ESGenericException(e)             => throw e
      }
  }

  sealed trait RestoreResult
  case object RestoreSuccess extends RestoreResult
  case object RestoreFailure extends RestoreResult

  private def restoreLatestSnapshot(
      client: ElasticClient,
      index: IndexDefinition
  ): Future[RestoreResult] = {
    logger.info(
      "Attempting to restore snapshot for {} version {}",
      index.name,
      index.version
    )

    getLatestSnapshot(client, index) flatMap {
      case None =>
        logger.info(
          "Could not find a snapshot for {} version {}",
          index.name,
          index.version
        )
        Future.successful(RestoreFailure)
      case Some(snapshot: Snapshot) =>
        logger.info(
          "Found snapshot {} for {} version {}, queueing restore operation",
          snapshot.snapshot,
          index.name,
          index.version
        )
        val promise = Promise[RestoreResult]()
        restoreQueue.offer((client, index, snapshot, promise))
        promise.future
    }
  }

  private def getLatestSnapshot(
      client: ElasticClient,
      index: IndexDefinition
  ): Future[Option[Snapshot]] = {
    def getSnapshot() = client.execute {
      GetSnapshotsRequest(Seq("_all"), SNAPSHOT_REPO_NAME)
    }

    getSnapshot()
      .flatMap {
        case results: RequestSuccess[GetSnapshotResponse] =>
          Future.successful(results.result)
        case RepositoryMissingException(e) =>
          createSnapshotRepo(client, index).flatMap(_ => getSnapshot).map {
            case ESGenericException(e)                        => throw e
            case results: RequestSuccess[GetSnapshotResponse] => results.result
          }
        case ESGenericException(e) => throw e
      }
      .map {
        case GetSnapshotResponse(snapshots) =>
          snapshots
            .filter(_.snapshot.startsWith(snapshotPrefix(index)))
            // --- As of v6.5.1 elastic4s doesn't parse `shards_stats` yet
            .filter(_.state == "SUCCESS")
            .sortBy(_.endTimeInMillis)
            .headOption
        case _ => throw new Exception("getLatestSnapshot: Invalid response")
      }
  }

  private def createSnapshotRepo(
      client: ElasticClient,
      definition: IndexDefinition
  ) = {
    val repoConfig = config.getConfig("elasticSearch.snapshotRepo")
    val repoType = repoConfig.getString("type")
    val settings = repoConfig
      .getConfig("types." + repoType)
      .entrySet()
      .asScala
      .map { case entry => (entry.getKey, entry.getValue().unwrapped()) } toMap

    client.execute(
      CreateRepositoryRequest(SNAPSHOT_REPO_NAME, repoType, None, settings)
    )
  }

  private def snapshotPrefix(definition: IndexDefinition) =
    s"${definition.name}-${definition.version}"

  private def getYears(
      from: Option[OffsetDateTime],
      to: Option[OffsetDateTime]
  ): Option[String] = {
    val newFrom = from.orElse(to).map(_.getYear)
    val newTo = to.orElse(from).map(_.getYear)

    (newFrom, newTo) match {
      case (Some(newFrom), Some(newTo)) => Some(s"$newFrom-$newTo")
      case _                            => None
    }
  }

  def snapshot(): Future[Unit] = {
    List(
      IndexDefinition.dataSets,
      IndexDefinition.publishers,
      IndexDefinition.formats
    ).foldLeft(Future.successful(Unit)) { (f, idxDef) =>
        f.flatMap(
          _ =>
            setupFuture
              .flatMap(client => createSnapshot(client, idxDef))
              .map(_ => Unit)
        )
      }
      .map(_ => Unit)
  }

  def trim(before: OffsetDateTime): Future[Unit] = {
    //-- Caution: Elastic4s incorrect add _all to the endpoint if idx `type` not provide
    //-- Before it's fixed, we cannot remove the idx type
    val trimIndexFutureList = List(
      indices.getIndex(config, Indices.DataSetsIndex),
      indices.getIndex(config, Indices.PublishersIndex),
      indices.getIndex(config, Indices.FormatsIndex)
    ).map { idxName =>
      setupFuture
        .flatMap { client =>
          client.execute(
            deleteIn(idxName)
              .by(rangeQuery("indexed").lt(before.toString))
              .proceedOnConflicts(true)
          )
        }
        .map { res =>
          if (res.isError) {
            logger.error(
              "Failed to Trimmed index {} old datasets: {}",
              idxName,
              res.body.getOrElse(res.error.reason)
            )
            throw res.error.asException
          } else {
            res.result match {
              case Left(r) =>
                logger.info(
                  "Trimmed index {} for {} old datasets",
                  idxName,
                  r.deleted
                )
              case Right(r) =>
                logger.info(
                  "A task has been created for trimmed index {}. Task Id: {}. Node Id: {}",
                  idxName,
                  r.taskId,
                  r.nodeId
                )
            }
          }
        } recover {
        case e: Throwable =>
          logger.error(
            "Failed to Trimmed index {} old datasets: {}",
            idxName,
            e.getMessage
          )
          throw e
      }
    }

    Future.sequence(trimIndexFutureList).map(_ => Unit)
  }

  def delete(identifiers: Seq[String]): Future[Unit] = {
    setupFuture
      .flatMap { client =>
        client.execute(
          bulk(
            identifiers.map(
              identifier =>
                ElasticDsl
                  .deleteById(
                    indices.getIndex(config, Indices.DataSetsIndex),
                    identifier
                  )
            )
          )
        )
      }
      .map {
        case results: RequestSuccess[BulkResponse] =>
          logger.info("Deleted {} datasets", results.result.successes.size)
        case f: RequestFailure =>
          logger.warning(
            "Failed to delete: {}, {}",
            f.error.`type`,
            f.error.reason
          )
      }
  }

  def refreshIndex(index: Indices.Index): Future[Unit] = {
    setupFuture
      .flatMap { client =>
        client.execute(
          ElasticDsl.refreshIndex(indices.getIndex(config, index))
        )
      }
      .map {
        case r: RequestSuccess[RefreshIndexResponse] =>
        case f: RequestFailure =>
          throw new Exception(s"Failed to refresh index: ${f.error}")
      }
  }

  private def createSnapshot(
      client: ElasticClient,
      definition: IndexDefinition
  ): Future[Unit] = {
    if (config.getBoolean("indexer.makeSnapshots")) {
      logger.info(
        "Creating snapshot for {} at version {}",
        definition.name,
        definition.version
      )

      client
        .execute {
          com.sksamuel.elastic4s.requests.snapshots.CreateSnapshotRequest(
            snapshotPrefix(definition) + "-" + Instant
              .now()
              .toString
              .toLowerCase,
            SNAPSHOT_REPO_NAME,
            indices.getIndex(config, definition.indicesIndex),
            None,
            Some(true)
          )
        }
        .map {
          case results: RequestSuccess[CreateSnapshotResponse] =>
            logger.info(
              "Snapshotted {}",
              indices.getIndex(config, definition.indicesIndex)
            )
          /*val snapshot = results.result.asInstanceOf[CreateSnapshotResponse].snapshot
          logger.info("Snapshotted {} shards of {} for {}",
            snapshot.shards.successful,
            snapshot.shards.total,
            indices.getIndex(config, definition.indicesIndex)
          )*/
          case ESGenericException(e) =>
            logger.error(
              e,
              "Failed to snapshot {}",
              indices.getIndex(config, definition.indicesIndex)
            )
            throw e
        }
    } else {
      logger.info("Snapshotting disabled, skipping")
      Future(Unit)
    }
  }

  private def bulkIndex(definition: BulkRequest): Future[BulkResponse] =
    setupFuture.flatMap { client =>
      client.execute(definition).map {
        case ESGenericException(e) =>
          logger.error(e, "Error when indexing records")
          throw e
        case r: RequestSuccess[BulkResponse] =>
          r.result
      }
    }

  /**
    * Indexes a number of datasets into ES using a bulk insert.
    */
  private def buildDatasetIndexDefinition(
      rawDataSet: DataSet
  ): Seq[IndexRequest] = {
    val dataSet = rawDataSet.copy(
      years = ElasticSearchIndexer.getYears(
        rawDataSet.temporal.flatMap(_.start.flatMap(_.date)),
        rawDataSet.temporal.flatMap(_.end.flatMap(_.date))
      ),
      indexed = Some(OffsetDateTime.now)
    )

    val documentId =
      DataSet.uniqueEsDocumentId(rawDataSet.identifier, rawDataSet.tenantId)
    val indexDataSet = ElasticDsl
      .indexInto(
        indices.getIndex(config, Indices.DataSetsIndex)
      )
      .id(documentId)
      .source(dataSet.toJson)

    val indexPublisher = dataSet.publisher.flatMap(
      publisher =>
        publisher.name
          .filter(!"".equals(_))
          .map(
            publisherName =>
              ElasticDsl
                .indexInto(
                  indices.getIndex(config, Indices.PublishersIndex)
                )
                .id(publisherName.toLowerCase)
                .source(
                  Map(
                    "identifier" -> publisher.identifier.toJson,
                    "jurisdiction" -> publisher.jurisdiction.toJson,
                    "acronym" -> publisher.acronym.toJson,
                    "aggKeywords" -> publisher.aggKeywords.toJson,
                    "value" -> publisherName.toJson,
                    "description" -> publisher.description.toJson,
                    "imageUrl" -> publisher.imageUrl.toJson,
                    "phone" -> publisher.phone.toJson,
                    "email" -> publisher.email.toJson,
                    "addrStreet" -> publisher.addrStreet.toJson,
                    "addrSuburb" -> publisher.addrSuburb.toJson,
                    "addrState" -> publisher.addrState.toJson,
                    "addrPostCode" -> publisher.addrPostCode.toJson,
                    "addrCountry" -> publisher.addrCountry.toJson,
                    "website" -> publisher.website.toJson,
                    "source" -> publisher.source.toJson,
                    "indexed" -> OffsetDateTime.now.toString.toJson
                  ).toJson
                )
          )
    )

    val indexFormats = dataSet.distributions
      .filter(dist => dist.format.isDefined && !"".equals(dist.format.get))
      .map { distribution =>
        val format = distribution.format.get

        ElasticDsl
          .indexInto(
            indices.getIndex(config, Indices.FormatsIndex)
          )
          .id(format.toLowerCase)
          .source(
            Map(
              "value" -> format.toJson,
              "indexed" -> OffsetDateTime.now.toString.toJson
            ).toJson
          )
      }

    List(indexDataSet) ::: indexPublisher.toList ::: indexFormats.toList
  }

  def performIndex(
      dataSetStream: Source[(DataSet, Promise[Unit]), NotUsed],
      retryFailedDatasets: Boolean = true
  ): Future[SearchIndexer.IndexResult] = {
    val indexResults = dataSetStream
      .buffer(indexingBufferSize, OverflowStrategy.backpressure)
      .map {
        case (dataSet, promise) =>
          (buildDatasetIndexDefinition(dataSet), (dataSet, promise))
      }
      .batch(indexingMaxBatchSize, Seq(_))(_ :+ _)
      .initialDelay(indexingInitialBatchDelayMs)
      .mapAsync(1) { batch =>
        val onRetry = (retryCount: Int, e: Throwable) =>
          logger.error(
            "Failed to index {} records with {}, retrying",
            batch.length,
            e.getMessage
          )

        // Combine all the ES inserts into one bulk statement
        val bulkDef =
          bulk(batch.flatMap { case (esIndexDefs, _) => esIndexDefs })

        // Get out the source of each ES insert along with how many inserts it made (for publishers/formats etc)
        val sources = batch.map {
          case (indexDefs, (dataSet, promise)) =>
            (dataSet, promise, indexDefs.size)
        }

        retry(() => bulkIndex(bulkDef), 30.seconds, 4, onRetry)
          .map(result => (result, sources))
          .recover {
            case e: Throwable =>
              logger.error("Bulk request error: {}", e)
              val promises = sources.map(_._2)
              promises.foreach(_.failure(e))
              throw e
          }
      }
      .map {
        case (results, sources) =>
          val groupedResults = sources
            .map(_._3)
            .foldLeft((0, Seq[Seq[BulkResponseItem]]())) {
              case ((currentIndex, listSoFar), current) =>
                val group =
                  results.items.slice(currentIndex, currentIndex + current)
                (currentIndex + group.size, listSoFar :+ group)
            }
            ._2

          val resultTuples = groupedResults.zip(sources)

          val nonSuccesses = resultTuples.filter(_._1.exists(_.error.isDefined))
          val successes = resultTuples.filter(_._1.forall(_.error.isEmpty))
          val retryPromises: ListBuffer[Promise[Unit]] =
            ListBuffer()

          var failureCount: Long = 0
          val failureReasons: ListBuffer[String] = ListBuffer()
          val warnReasons: ListBuffer[String] = ListBuffer()

          nonSuccesses.foreach {
            case (theResults, (dataSet, promise, _)) =>
              // retry failed dataset
              val hasRetried = retryFailedDatasets && (tryReindexSpatialFail(
                dataSet,
                theResults,
                promise
              ) || tryReindexDynamicMappingTimeoutFail(
                dataSet,
                theResults,
                promise
              ))

              val errors = theResults.filter(_.error.isDefined).map(_.error.get)

              errors.foreach { error =>
                if (hasRetried) {
                  logger.warning(
                    "Failure when indexing {}: {}",
                    dataSet.identifier,
                    error
                  )
                } else {
                  logger.error(
                    "Failure when indexing {}: {}",
                    dataSet.identifier,
                    error
                  )
                }
              }

              if (hasRetried) {
                warnReasons.appendAll(errors.map(_.toString))
                retryPromises += promise
              } else {
                failureCount += 1
                failureReasons.appendAll(errors.map(_.toString))

                promise.failure(
                  new Exception(
                    s"Failed to index supplementary fields. errors: ${errors}"
                  )
                )
              }
          }

          successes.map(_._2).foreach {
            case (dataSet, promise, _) => promise.success(dataSet.identifier)
          }

          if (successes.nonEmpty) {
            logger.info("Successfully indexed {} datasets", successes.size)
          } else {
            logger.info("Failed to index this batch. {} ", resultTuples.size)
          }

          val retryFuture = retryPromises.toList
            .map(_.future.map(_ => None).recover {
              case e: Throwable => Some(e)
            })
            // 1st tuple element [Long]: warnsCount (retry successful) index dataset successful with warns (i.e. after retry)
            // 2nd tuple element [Long]: failureCount (retry failed)
            // 3rd tuple element [Seq[String]]: failed retry reasons
            .foldLeft(
              Future.successful[(Long, Long, Seq[String])]((0, 0, Seq()))
            )(
              (retryFuture, f) => {
                retryFuture.flatMap { result =>
                  f.map { e =>
                    if (e.isDefined) {
                      (result._1, result._2 + 1, result._3 :+ e.get.toString)
                    } else {
                      (result._1 + 1, result._2, result._3)
                    }
                  }
                }
              }
            )

          (
            successes.size,
            failureCount,
            failureReasons,
            retryFuture,
            warnReasons
          )
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when indexing: {}", e.getMessage)
          throw e
      }
      .runWith(
        Sink.fold(Future(SearchIndexer.IndexResult(0, 0, 0, Seq(), Seq()))) {
          case (
              combinedResultFuture,
              (
                successes,
                failureCount,
                failureReasons,
                retryFuture,
                warnReasons
              )
              ) =>
            combinedResultFuture.flatMap {
              combinedResult =>
                retryFuture.map {
                  retryResult =>
                    IndexResult(
                      combinedResult.successes + successes,
                      combinedResult.failures + failureCount + retryResult._2,
                      combinedResult.warns + retryResult._1,
                      combinedResult.failureReasons ++ failureReasons ++ retryResult._3,
                      combinedResult.warnReasons ++ warnReasons
                    )
                }

            }
        }
      )

    indexResults.flatMap(identity)
  }

  def index(
      dataSetStream: Source[DataSet, NotUsed]
  ): Future[SearchIndexer.IndexResult] =
    performIndex(dataSetStream.map(dataSet => (dataSet, Promise[Unit])), true)

}

object ElasticSearchIndexer {

  def getYears(
      from: Option[OffsetDateTime],
      to: Option[OffsetDateTime]
  ): Option[String] = {
    val newFrom = from.orElse(to).map(_.getYear)
    val newTo = to.orElse(from).map(_.getYear)

    (newFrom, newTo) match {
      case (Some(newFrom), Some(newTo)) => Some(s"$newFrom-$newTo")
      case _                            => None
    }
  }
}
