package au.csiro.data61.magda.indexer.search.elasticsearch

import java.time.{Instant, OffsetDateTime}

import akka.actor.ActorSystem
import akka.stream.{Materializer, OverflowStrategy, QueueOfferResult}
import akka.stream.scaladsl.{Sink, Source, SourceQueue}
import au.csiro.data61.magda.model.misc.{DataSet, Format, Publisher}
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.util.ErrorHandling.{RootCause, retry}
import org.elasticsearch.rest.RestStatus
import org.elasticsearch.transport.RemoteTransportException
import spray.json._
import com.sksamuel.elastic4s.bulk.BulkDefinition
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.{HttpClient, RequestFailure, RequestSuccess}
import com.sksamuel.elastic4s.http.bulk._
import com.sksamuel.elastic4s.snapshots._

import scala.collection.JavaConversions._
import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.concurrent.duration._
import scala.util.{Failure, Success}
import com.typesafe.config.Config
import com.sksamuel.elastic4s.http.bulk.BulkResponse
import com.sksamuel.elastic4s.http.bulk.BulkResponseItem
import akka.NotUsed
import com.sksamuel.elastic4s.indexes.{IndexDefinition => ESIndexDefinition}

import scala.util.Try
import au.csiro.data61.magda.search.elasticsearch._
import org.elasticsearch.index.query.QueryBuilders
import com.sksamuel.elastic4s.searches.queries.RawQueryDefinition
import com.sksamuel.elastic4s.http.index.IndexResponse
import com.sksamuel.elastic4s.http.index.mappings.IndexMappings
import com.sksamuel.elastic4s.http.snapshots._
import au.csiro.data61.magda.search.elasticsearch.Exceptions._
import com.sksamuel.elastic4s.http.snapshots.{CreateSnapshotResponse, GetSnapshotResponse, Snapshot}
import com.sksamuel.elastic4s.mappings.GetMappingDefinition

import au.csiro.data61.magda.indexer.crawler.RegistryCrawler
import au.csiro.data61.magda.indexer.crawler.RegistryCrawler
import au.csiro.data61.magda.client.RegistryExternalInterface
import au.csiro.data61.magda.indexer.crawler.RegistryCrawler

class ElasticSearchIndexer(
    val clientProvider: ClientProvider,
    val indices: Indices)(
        implicit val config: Config,
        implicit val system: ActorSystem,
        implicit val ec: ExecutionContext,
        implicit val materializer: Materializer) extends SearchIndexer {
  val logger = system.log
  val SNAPSHOT_REPO_NAME = "snapshots"

  /**
   * Returns an initialised HttpClient on completion. Using this to get the client rather than just keeping a reference to an initialised client
   *  ensures that all queries will only complete after the client is initialised.
   */
  private val setupFuture = setup()

  implicit val scheduler = system.scheduler

  override def ready = setupFuture.map(_ => Unit)

  // This needs to be a queue here because if we queue more than 50 requests into ElasticSearch it gets very very mad.
  private lazy val indexQueue: SourceQueue[(DataSet, Promise[Unit])] =
    Source.queue[(DataSet, Promise[Unit])](Int.MaxValue, OverflowStrategy.backpressure)
      .map {
        case (dataSet, promise) => (buildDatasetIndexDefinition(dataSet), (dataSet, promise))
      }
      .batch(1000, Seq(_))(_ :+ _)
      .initialDelay(500 milliseconds)
      .mapAsync(1) { batch =>
        val onRetry = (retryCount: Int, e: Throwable) => logger.error("Failed to index {} records with {}, retrying", batch.length, e.getMessage)

        // Combine all the ES inserts into one bulk statement
        val bulkDef = bulk(batch.flatMap { case (esIndexDefs, _) => esIndexDefs })

        // Get out the source of each ES insert along with how many inserts it made (for publishers/formats etc)
        val sources = batch.map { case (indexDefs, (dataSet, promise)) => (dataSet, promise, indexDefs.size) }

        retry(() => bulkIndex(bulkDef), 30 seconds, 4, onRetry)
          .map(result => (result, sources))
          .recover {
            case e: Throwable =>
              val promises = sources.map(_._2)
              promises.foreach(_.failure(e))
              throw e
          }
      }
      .map{
        case (results, sources) =>

          val groupedResults = sources.map(_._3).foldLeft((0, Seq[Seq[BulkResponseItem]]())) {
            case ((currentIndex, listSoFar), current) =>
              val group = results.items.drop(currentIndex).take(current)
              (currentIndex + group.size, listSoFar :+ group)
          }._2

          val resultTuples = groupedResults.zip(sources)

          val failures = resultTuples.filter(_._1.exists(_.error.isDefined))
          val successes = resultTuples.filter(_._1.forall(_.error.isEmpty))

          failures.foreach {
            case (results, (dataSet, promise, _)) =>
              results.filter(_.error.isDefined).foreach { failure =>
                logger.warning("Failure when indexing {}: {}", dataSet.uniqueId, failure.error)
              }

              // The dataset result is always the first
              if (results.head.error.isDefined) {
                tryReindexSpatialFail(dataSet, results.head, promise)
              } else {
                promise.failure(new Exception("Failed to index supplementary field"))
              }
          }

          if (!successes.isEmpty) {
            logger.info("Successfully indexed {} datasets", successes.size)
          }

          successes.map(_._2).foreach { case (dataSet, promise, _) => promise.success(dataSet.uniqueId) }
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when indexing: {}", e.getMessage)
          throw e
      }
      .to(Sink.ignore)
      .run()

  private lazy val restoreQueue: SourceQueue[(HttpClient, IndexDefinition, Snapshot, Promise[RestoreResult])] =
    Source.queue[(HttpClient, IndexDefinition, Snapshot, Promise[RestoreResult])](Int.MaxValue, OverflowStrategy.backpressure)
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info("Restoring snapshot {} for {} version {}", snapshot.snapshot, definition.name, definition.version)

          logger.info("First deleting existing index if present...")

          deleteIndex(client, definition).map(_ => (client, definition, snapshot, promise))
      }
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info("Restoring snapshot into {}", definition.name)

          client.execute {
            new RestoreSnapshot(
              snapshotName = snapshot.snapshot,
              repositoryName = SNAPSHOT_REPO_NAME,
              indices = indices.getIndex(config, definition.indicesIndex),
              waitForCompletion = Some(true)
            )
          } map {
            case Right(_) =>
              logger.info("Restored {} version {}", definition.name, definition.version)
              promise.success(RestoreSuccess)
            case Left(failure) =>
              logger.info("Failed to restore for {} version {} with status {}", definition.name, definition.version, failure.status)
              promise.success(RestoreFailure)
          }
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when restoring: {}", e.getMessage)
      }
      .to(Sink.last)
      .run()

  /** Initialises an HttpClient, handling initial connection to the ElasticSearch server and creation of the indices */
  private def setup(): Future[HttpClient] = {
    clientProvider.getClient.flatMap(client =>
      retry(() => getIndexDefinitions(client), 10 seconds, config.getInt("indexer.connectionRetries"), logger.error("Failed to get indexes, {} retries left", _, _))
        .flatMap { indexPairs =>
          updateIndices(client, indexPairs)
            .map { _ =>
              // If we've got to here everything has gone swimmingly - the index is all ready to have data loaded, so return the client for other methods to play with :)
              client
            }
        }).recover {
      case t: Throwable =>
        logger.error(t, "Could not connect to elasticsearch - this is a fatal error, so I'm dying now.")
        System.exit(1)
        throw t
    }
  }

  private def tryReindexSpatialFail(dataSet: DataSet, result: BulkResponseItem, promise: Promise[Unit]) = {
    val geoFail = result.error.isDefined && result.error.exists(_.reason.contains("failed to parse [spatial.geoJson]"))

    if (geoFail) {
      logger.info("Excluded dataset {} due to bad geojson - trying these again with spatial.geoJson excluded", dataSet.uniqueId)
      val dataSetWithoutSpatial = dataSet.copy(spatial = dataSet.spatial.map(spatial => spatial.copy(geoJson = None)))
      index(dataSetWithoutSpatial, promise)
    } else {
      promise.failure(new Exception(s"Had failures other than geoJson parse: ${result.error}"))
    }
  }

  /**
   * Returns a future that gets a seq of each index paired with its current ES definition.
   */
  private def getIndexDefinitions(client: HttpClient) = {
    def indexNotFound(indexDef: IndexDefinition, inner: RuntimeException) = {
      logger.warning("{} index was not present, if this is the first boot with a new index version this is fine: {}", indexDef.name, inner.getMessage)
      None
    }

    val futures = IndexDefinition.indices.map(indexDef =>
      client.execute(ElasticDsl.getMapping(indices.getIndex(config, indexDef.indicesIndex)))
        .map{
          case Right(results) => Some(results.result)
          case Left(IndexNotFoundException(e)) =>
            // If the index wasn't found that's fine, we'll just recreate it. Otherwise log an error - every subsequent request to the provider will fail with this exception.
            indexNotFound(indexDef, e)
          case Left(ESGenericException(e)) =>
              logger.error("failed to get {} index, error: {}", indexDef.name, e.getMessage)
              None
        }
    )
    Future.sequence(futures)
      .map(_.zip(IndexDefinition.indices))
  }

  private def updateIndices(client: HttpClient, definitionPairs: Seq[(Option[Seq[IndexMappings]], IndexDefinition)]): Future[Object] =
    Future.sequence(definitionPairs.map {
      case (mappings, definition) =>
        // If no index, create it
        mappings match {
          case Some(_) =>
            logger.info("{} index version {} already exists", definition.name, definition.version)
            Future.successful(Unit)
          case None =>
            logger.info("{} index version {} does not exist, creating", definition.name, definition.version)
            buildIndex(client, definition)
        }
    })

  private def buildIndex(client: HttpClient, definition: IndexDefinition): Future[Any] = {
    val snapshotFuture = if (config.getBoolean("indexer.readSnapshots"))
      restoreLatestSnapshot(client, definition)
    else {
      logger.info("Snapshot restoration disabled, rebuilding index manually")
      Future(RestoreFailure)
    }

    def processingDefinitionCreateHandler()= {
      (definition.create) match {
        case Some(createFunc) => createFunc(client, indices, config)(materializer, system)
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
          case Right(r) =>
            logger.info("Index {} version {} created", definition.name, definition.version)

            processingDefinitionCreateHandler()

          case Left(ResourceAlreadyExistsException(e)) =>
            logger.info("Index {} version {} has already been created. ", definition.name, definition.version)

            processingDefinitionCreateHandler()

          case Left(ESGenericException(e)) =>
            logger.error(e, "Failed to set up the index")
            throw e
          }
    }
  }

  def deleteIndex(client: HttpClient, definition: IndexDefinition): Future[Unit] = client.execute {
    ElasticDsl.deleteIndex(indices.getIndex(config, definition.indicesIndex))
  }.map{
    case Left(IndexNotFoundException(e)) => // Meh, we were trying to delete it anyway.
    case Left(ESGenericException(e)) => throw e
    case Right(r) => Unit
  }.recover{
    case e: Throwable =>
      logger.debug("Exception class {}", e.getClass.toString)
      throw e
  }.map { _ =>
    Unit
  }

  def isEmpty(index: Indices.Index): Future[Boolean] = {
    for {
        client <- setupFuture
        result <- client.execute(ElasticDsl.search(indices.getIndex(config, index)))
      } yield (result match{
        case Right(r) => r.result.isEmpty
        case Left(ESGenericException(e)) => throw e
      })
  }

  sealed trait RestoreResult
  case object RestoreSuccess extends RestoreResult
  case object RestoreFailure extends RestoreResult

  private def restoreLatestSnapshot(client: HttpClient, index: IndexDefinition): Future[RestoreResult] = {
    logger.info("Attempting to restore snapshot for {} version {}", index.name, index.version)

    getLatestSnapshot(client, index) flatMap {
      case None =>
        logger.info("Could not find a snapshot for {} version {}", index.name, index.version)
        Future.successful(RestoreFailure)
      case Some(snapshot) =>
        logger.info("Found snapshot {} for {} version {}, queueing restore operation", snapshot.snapshot, index.name, index.version)
        val promise = Promise[RestoreResult]()
        restoreQueue.offer((client, index, snapshot, promise))
        promise.future
    }
  }

  private def getLatestSnapshot(client: HttpClient, index: IndexDefinition): Future[Option[Snapshot]] = {
    def getSnapshot() = client.execute {
      new GetSnapshots(Seq("_all"), SNAPSHOT_REPO_NAME)
    }

    getSnapshot()
      .flatMap {
        case Right(results) => Future.successful(results.result.snapshots)
        case Left(RepositoryMissingException(e)) =>
          createSnapshotRepo(client, index).flatMap(_ => getSnapshot).map{
            case Left(ESGenericException(e)) => throw e
            case Right(results) => Future.successful(results.result)
          }
        case Left(ESGenericException(e)) => throw e
      }.map {
        case snapshots : Seq[Snapshot] =>
          snapshots
            .filter(_.snapshot.startsWith(snapshotPrefix(index)))
          .filter(_.shards.failed == 0)
          .sortBy(_.endTimeInMillis)
          .headOption
        case _ => throw new Exception("getLatestSnapshot: Invalid response")
      }
  }

  private def createSnapshotRepo(client: HttpClient, definition: IndexDefinition) = {
    val repoConfig = config.getConfig("elasticSearch.snapshotRepo")
    val repoType = repoConfig.getString("type")
    val settings = repoConfig.getConfig("types." + repoType).entrySet().map { case entry => (entry.getKey, entry.getValue().unwrapped()) } toMap

    client.execute(
      new CreateRepository(SNAPSHOT_REPO_NAME, repoType, None, settings)
    )
  }

  private def snapshotPrefix(definition: IndexDefinition) = s"${definition.name}-${definition.version}"

  private def getYears(from: Option[OffsetDateTime], to: Option[OffsetDateTime]): Option[String] = {
    val newFrom = from.orElse(to).map(_.getYear)
    val newTo = to.orElse(from).map(_.getYear)

    (newFrom, newTo) match {
      case (Some(newFrom), Some(newTo)) => Some(s"$newFrom-$newTo")
      case _                            => None
    }
  }

  override def index(dataSetStream: Source[DataSet, NotUsed]) = {
    val indexResults = dataSetStream
      // Queue every dataSet for indexing and keep the future along with the dataset's identifier
      .map(dataSet => (dataSet.uniqueId, index(dataSet)))
      // Combine all of these operations into one future
      .runWith(Sink.fold(Future(new SearchIndexer.IndexResult(0, Seq()))) {
        case (combinedResultFuture, (thisResultIdentifier, thisResultFuture)) =>
          combinedResultFuture.flatMap { combinedResult =>
            thisResultFuture.map { _ =>
              combinedResult.copy(successes = combinedResult.successes + 1)
            }.recover {
              case (e: Throwable) =>
                combinedResult.copy(failures = combinedResult.failures :+ thisResultIdentifier)
            }
          }
      })

    indexResults.flatMap(identity)
  }

  def index(dataSet: DataSet, promise: Promise[Unit] = Promise[Unit]): Future[Unit] = {
    indexQueue.offer((dataSet, promise))
      .flatMap {
        case QueueOfferResult.Enqueued    => promise.future
        case QueueOfferResult.Dropped     => throw new Exception("Dropped")
        case QueueOfferResult.QueueClosed => throw new Exception("Queue Closed")
        case QueueOfferResult.Failure(e)  => throw e
      }
  }

  def snapshot(): Future[Unit] = {
    List(
      IndexDefinition.dataSets,
      IndexDefinition.publishers,
      IndexDefinition.formats
    ).foldLeft(Future.successful(Unit)){ (f, idxDef) =>
      f.flatMap(_=> setupFuture.flatMap(client => createSnapshot(client, idxDef)).map(_=>Unit))
    }.map(_=>Unit)
  }


  def trim(before: OffsetDateTime): Future[Unit] = {
    //-- Caution: Elastic4s incorrect add _all to the endpoint if idx `type` not provide
    //-- Before it's fixed, we cannot remove the idx type
    val trimIndexFutureList = List(
      indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType),
      indices.getIndex(config, Indices.PublishersIndex) / indices.getType(Indices.PublisherIndexType),
      indices.getIndex(config, Indices.FormatsIndex) / indices.getType(Indices.FormatsIndexType)
    ).map{ idxName =>
      setupFuture.flatMap { client =>
        client.execute(
          deleteIn(idxName).by(
            rangeQuery("indexed").lt(before.toString)))
      }.map {
        case Right(results) =>
          logger.info("Trimmed index {} for {} old datasets", idxName, results.result.deleted)
        case Left(ESGenericException(e)) =>
          logger.info("Failed to Trimmed index {} old datasets: {}", idxName, e.getMessage)
      }
    }

    Future.sequence(trimIndexFutureList).map(_=>Unit)
  }


  def delete(identifiers: Seq[String]): Future[Unit] = {
    setupFuture.flatMap { client =>
      client.execute(bulk(identifiers.map(identifier =>
        ElasticDsl.delete(identifier).from(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType)))))
    }.map {
      case Right(results) =>
        logger.info("Deleted {} datasets", results.result.successes.length)
      case Left(f) =>
        logger.warning("Failed to delete: {}, {}", f.error.`type`, f.error.reason)
    }
  }

  private def createSnapshot(client: HttpClient, definition: IndexDefinition): Future[Unit] = {
    if (config.getBoolean("indexer.makeSnapshots")) {
      logger.info("Creating snapshot for {} at version {}", definition.name, definition.version)

      client.execute {
        com.sksamuel.elastic4s.snapshots.CreateSnapshot(
          snapshotPrefix(definition) + "-" + Instant.now().toString.toLowerCase,
          SNAPSHOT_REPO_NAME,
          indices.getIndex(config, definition.indicesIndex),
          None,
          Some(true)
        )
      }.map{
        case Right(results) =>
          logger.info("Snapshotted {}",
            indices.getIndex(config, definition.indicesIndex)
          )
          /*val snapshot = results.result.asInstanceOf[CreateSnapshotResponse].snapshot
          logger.info("Snapshotted {} shards of {} for {}",
            snapshot.shards.successful,
            snapshot.shards.total,
            indices.getIndex(config, definition.indicesIndex)
          )*/
        case Left(ESGenericException(e)) =>
            logger.error(e, "Failed to snapshot {}", indices.getIndex(config, definition.indicesIndex))
            throw e
      }
    } else {
      logger.info("Snapshotting disabled, skipping")
      Future(Unit)
    }
  }

  private def bulkIndex(definition: BulkDefinition): Future[BulkResponse] =
    setupFuture.flatMap { client =>
      client.execute(definition).map{
        case Left(ESGenericException(e)) =>
          logger.error(e, "Error when indexing records")
          throw e
        case Right(r) =>
          r.result
      }
    }

  /**
   * Indexes a number of datasets into ES using a bulk insert.
   */
  private def buildDatasetIndexDefinition(rawDataSet: DataSet): Seq[ESIndexDefinition] = {
    val dataSet = rawDataSet.copy(
      description = rawDataSet.description.map(_.take(32766)),
      years = ElasticSearchIndexer.getYears(rawDataSet.temporal.flatMap(_.start.flatMap(_.date)), rawDataSet.temporal.flatMap(_.end.flatMap(_.date))),
      indexed = Some(OffsetDateTime.now))

    val indexDataSet = ElasticDsl.indexInto(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType)).id(dataSet.uniqueId).source(dataSet.toJson)

    val indexPublisher = dataSet.publisher.flatMap(publisher => publisher.name.filter(!"".equals(_)).map(publisherName =>
      ElasticDsl.indexInto(indices.getIndex(config, Indices.PublishersIndex) / indices.getType(Indices.PublisherIndexType))
        .id(publisherName.toLowerCase)
        .source(Map(
          "identifier" -> publisher.identifier.toJson,
          "acronym" -> publisher.acronym.toJson,
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
          "indexed" -> OffsetDateTime.now.toString.toJson).toJson)
    ))

    val indexFormats = dataSet.distributions.filter(dist => dist.format.isDefined && !"".equals(dist.format.get)).map { distribution =>
      val format = distribution.format.get

      ElasticDsl.indexInto(indices.getIndex(config, Indices.FormatsIndex) / indices.getType(Indices.FormatsIndexType))
        .id(format.toLowerCase)
        .source(Map(
          "value" -> format.toJson,
          "indexed" -> OffsetDateTime.now.toString.toJson
        ).toJson)
    }

    List(indexDataSet) ::: indexPublisher.toList ::: indexFormats.toList
  }
}

object ElasticSearchIndexer {
  def getYears(from: Option[OffsetDateTime], to: Option[OffsetDateTime]): Option[String] = {
    val newFrom = from.orElse(to).map(_.getYear)
    val newTo = to.orElse(from).map(_.getYear)

    (newFrom, newTo) match {
      case (Some(newFrom), Some(newTo)) => Some(s"$newFrom-$newTo")
      case _                            => None
    }
  }
}
