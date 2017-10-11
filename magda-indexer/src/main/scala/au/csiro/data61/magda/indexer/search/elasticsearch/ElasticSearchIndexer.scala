package au.csiro.data61.magda.indexer.search.elasticsearch

import java.time.{ Instant, OffsetDateTime }

import akka.actor.ActorSystem
import akka.stream.{ Materializer, OverflowStrategy, QueueOfferResult }
import akka.stream.scaladsl.{ Sink, Source, SourceQueue }
import au.csiro.data61.magda.model.misc.{ DataSet, Format, Publisher }
import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.util.ErrorHandling.{ RootCause, retry }
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.mappings.GetMappingsResult
import org.elasticsearch.action.admin.cluster.repositories.put.PutRepositoryResponse
import org.elasticsearch.action.admin.cluster.snapshots.create.CreateSnapshotResponse
import org.elasticsearch.action.admin.cluster.snapshots.get.GetSnapshotsResponse
import org.elasticsearch.index.IndexNotFoundException
import org.elasticsearch.repositories.RepositoryMissingException
import org.elasticsearch.rest.RestStatus
import org.elasticsearch.snapshots.SnapshotInfo
import org.elasticsearch.transport.RemoteTransportException
import spray.json._
import org.elasticsearch.action.bulk.{ BulkResponse }
import com.sksamuel.elastic4s.bulk.BulkDefinition
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.ElasticDsl

import scala.collection.JavaConversions._
import scala.concurrent.{ ExecutionContext, Future, Promise }
import scala.concurrent.duration._
import scala.util.{ Failure, Success }
import com.typesafe.config.Config
import com.sksamuel.elastic4s.bulk.RichBulkResponse
import org.elasticsearch.action.bulk.BulkItemResponse
import com.sksamuel.elastic4s.bulk.RichBulkItemResponse
import akka.NotUsed
import com.sksamuel.elastic4s.indexes.{ IndexDefinition => ESIndexDefinition }
import scala.util.Try
import au.csiro.data61.magda.search.elasticsearch.IndexDefinition
import au.csiro.data61.magda.search.elasticsearch.Indices;

import org.elasticsearch.index.query.QueryBuilders
import com.sksamuel.elastic4s.searches.queries.RawQueryDefinition
import com.sksamuel.elastic4s.index.RichIndexResponse
import au.csiro.data61.magda.search.elasticsearch.ClientProvider

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
   * Returns an initialised {@link TcpClient} on completion. Using this to get the client rather than just keeping a reference to an initialised client
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
      .map {
        case (result: RichBulkResponse, sources) =>
          val groupedResults = sources.map(_._3).foldLeft((0, Seq[Seq[RichBulkItemResponse]]())) {
            case ((currentIndex, listSoFar), current) =>
              val group = result.items.drop(currentIndex).take(current)
              (currentIndex + group.size, listSoFar :+ group)
          }._2

          val resultTuples = groupedResults.zip(sources)

          val failures = resultTuples.filter(_._1.exists(_.isFailure))
          val successes = resultTuples.filter(_._1.forall(!_.isFailure))

          failures.foreach {
            case (results, (dataSet, promise, _)) =>
              results.filter(_.isFailure).foreach { failure =>
                logger.warning("Failure when indexing {}: {}", dataSet.uniqueId, failure.failureMessage)
              }

              // The dataset result is always the first
              if (results.head.isFailure) {
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

  private lazy val restoreQueue: SourceQueue[(TcpClient, IndexDefinition, SnapshotInfo, Promise[RestoreResult])] =
    Source.queue[(TcpClient, IndexDefinition, SnapshotInfo, Promise[RestoreResult])](Int.MaxValue, OverflowStrategy.backpressure)
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info("Restoring snapshot {} for {} version {}", snapshot.snapshotId.getName, definition.name, definition.version)

          logger.info("First deleting existing index if present...")

          deleteIndex(client, definition).map(_ => (client, definition, snapshot, promise))
      }
      .mapAsync(1) {
        case (client, definition, snapshot, promise) =>
          logger.info("Restoring snapshot")

          client.execute {
            restore snapshot snapshot.snapshotId.getName from SNAPSHOT_REPO_NAME indexes indices.getIndex(config, Indices.DataSetsIndex) waitForCompletion true
          } map { response =>
            response.status match {
              case RestStatus.OK =>
                logger.info("Restored {} version {}", definition.name, definition.version)
                promise.success(RestoreSuccess)
              case status: RestStatus =>
                logger.info("Failed to restore for {} version {} with status {}", definition.name, definition.version, status)
                promise.success(RestoreFailure)
            }
          }
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when restoring: {}", e.getMessage)
      }
      .to(Sink.last)
      .run()

  /** Initialises an {@link TcpClient}, handling initial connection to the ElasticSearch server and creation of the indices */
  private def setup(): Future[TcpClient] = {
    clientProvider.getClient(system.scheduler, logger, ec).flatMap(client =>
      retry(() => getIndexDefinitions(client), 10 seconds, config.getInt("indexer.connectionRetries"), logger.error("Failed to get indexes, {} retries left", _, _))
        .flatMap { indexPairs =>
          updateIndices(client, indexPairs)
            .map { _ =>
              // If we've got to here everything has gone swimmingly - the index is all ready to have data loaded, so return the client for other methods to play with :)
              client
            }
        })
  }

  private def tryReindexSpatialFail(dataSet: DataSet, result: RichBulkItemResponse, promise: Promise[Unit]) = {
    val geoFail = result.isFailure && result.failureMessage.contains("failed to parse [spatial.geoJson]")

    if (geoFail) {
      logger.info("Excluded dataset {} due to bad geojson - trying these again with spatial.geoJson excluded", dataSet.uniqueId)
      val dataSetWithoutSpatial = dataSet.copy(spatial = dataSet.spatial.map(spatial => spatial.copy(geoJson = None)))
      index(dataSetWithoutSpatial, promise)
    } else {
      promise.failure(new Exception(s"Had failures other than geoJson parse: ${result.failureMessage}"))
    }
  }

  /**
   * Returns a future that gets a seq of each index paired with its current ES definition.
   */
  private def getIndexDefinitions(client: TcpClient) = {
    def indexNotFound(indexDef: IndexDefinition, inner: IndexNotFoundException) = {
      logger.warning("{} index was not present, if this is the first boot with a new index version this is fine: {}", indexDef.name, inner.getMessage)
      None
    }

    val futures = IndexDefinition.indices.map(indexDef =>
      client.execute(getMapping(indices.getIndex(config, indexDef.indicesIndex)))
        .map(Some(_))
        .recover {
          // If the index wasn't found that's fine, we'll just recreate it. Otherwise log an error - every subsequent request to the provider will fail with this exception.
          case RootCause(inner: IndexNotFoundException) => indexNotFound(indexDef, inner)
        })

    Future.sequence(futures)
      .map(esDefinitions => esDefinitions.zip(IndexDefinition.indices))
  }

  private def updateIndices(client: TcpClient, definitionPairs: Seq[(Option[GetMappingsResult], IndexDefinition)]): Future[Object] =
    Future.sequence(definitionPairs.map {
      case (mapping, definition) =>
        // If no index, create it
        mapping match {
          case Some(_) =>
            logger.info("{} index version {} already exists", definition.name, definition.version)
            Future.successful(Unit)
          case None =>
            logger.info("{} index version {} does not exist, creating", definition.name, definition.version)
            buildIndex(client, definition)
        }
    })

  private def buildIndex(client: TcpClient, definition: IndexDefinition): Future[Any] = {
    val snapshotFuture = if (config.getBoolean("indexer.readSnapshots"))
      restoreLatestSnapshot(client, definition)
    else {
      logger.info("Snapshot restoration disabled, rebuilding index manually")
      Future(RestoreFailure)
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
          } flatMap { _ =>
            logger.info("Index {} version {} created", definition.name, definition.version)

            definition.create match {
              case Some(createFunc) => createFunc(client, indices, config)(materializer, system)
                .flatMap(_ => {
                  if (config.getBoolean("indexer.makeSnapshots"))
                    createSnapshot(client, definition)
                  else {
                    logger.info("Snapshotting disabled, skipping")
                    Future(Unit)
                  }
                })
              case None => Future(Unit)
            }
          }
    }
  }

  def deleteIndex(client: TcpClient, definition: IndexDefinition): Future[Unit] = client.execute {
    ElasticDsl.deleteIndex(indices.getIndex(config, definition.indicesIndex))
  } recover {
    case RootCause(inner: IndexNotFoundException) => // Meh, we were trying to delete it anyway.
    case e =>
      logger.debug("Exception class {}", e.getClass.toString)
      throw e
  } map { _ =>
    Unit
  }

  sealed trait RestoreResult
  case object RestoreSuccess extends RestoreResult
  case object RestoreFailure extends RestoreResult

  private def restoreLatestSnapshot(client: TcpClient, index: IndexDefinition): Future[RestoreResult] = {
    logger.info("Attempting to restore snapshot for {} version {}", index.name, index.version)

    getLatestSnapshot(client, index) flatMap {
      case None =>
        logger.info("Could not find a snapshot for {} version {}", index.name, index.version)
        Future.successful(RestoreFailure)
      case Some(snapshot) =>
        logger.info("Found snapshot {} for {} version {}, queueing restore operation", snapshot.snapshotId.getName, index.name, index.version)
        val promise = Promise[RestoreResult]()
        restoreQueue.offer((client, index, snapshot, promise))
        promise.future
    }
  }

  private def getLatestSnapshot(client: TcpClient, index: IndexDefinition): Future[Option[SnapshotInfo]] = {
    def getSnapshot(): Future[GetSnapshotsResponse] = client.execute {
      get snapshot Seq() from SNAPSHOT_REPO_NAME
    }

    getSnapshot()
      .map(x => Future.successful(x))
      .recover {
        case RootCause(e: RepositoryMissingException) =>
          createSnapshotRepo(client, index).flatMap(_ => getSnapshot)
        case e: Throwable => throw new RuntimeException(e)
      }
      .flatMap(identity)
      .map { response =>
        response.getSnapshots
          .view
          .filter(_.snapshotId.getName.startsWith(snapshotPrefix(index)))
          .filter(_.failedShards() == 0)
          .sortBy(-_.endTime)
          .headOption
      }
  }

  private def createSnapshotRepo(client: TcpClient, definition: IndexDefinition): Future[PutRepositoryResponse] = {
    val repoConfig = config.getConfig("elasticSearch.snapshotRepo")
    val repoType = repoConfig.getString("type")
    val settings = repoConfig.getConfig("types." + repoType).entrySet().map { case entry => (entry.getKey, entry.getValue().unwrapped()) } toMap

    client.execute(
      create repository SNAPSHOT_REPO_NAME `type` repoType settings settings)
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

  def snapshot(): Future[Unit] = setupFuture.flatMap(client => createSnapshot(client, IndexDefinition.dataSets)).map(_ => Unit)

  def trim(before: OffsetDateTime): Future[Unit] =
    setupFuture.flatMap { client =>
      client.execute(
        deleteIn(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType)).by(
          rangeQuery("indexed").lt(before.toString)))
    }.map { response =>
      logger.info("Trimmed {} old datasets", response.getDeleted)

      Unit
    }

  private def createSnapshot(client: TcpClient, definition: IndexDefinition): Future[CreateSnapshotResponse] = {
    logger.info("Creating snapshot for {} at version {}", definition.name, definition.version)

    val future = client.execute {
      create snapshot snapshotPrefix(definition) + "-" + Instant.now().toString.toLowerCase in SNAPSHOT_REPO_NAME waitForCompletion true indexes indices.getIndex(config, definition.indicesIndex)
    }

    future.onComplete {
      case Success(result) =>
        val info = result.getSnapshotInfo
        logger.info("Snapshotted {} shards of {} for {}", info.successfulShards(), info.totalShards(), indices.getIndex(config, definition.indicesIndex))
      case Failure(e) => logger.error(e, "Failed to snapshot {}", indices.getIndex(config, definition.indicesIndex))
    }

    future
  }

  private def bulkIndex(definition: BulkDefinition): Future[RichBulkResponse] =
    setupFuture.flatMap { client =>
      client.execute(definition)
        .recover {
          case t: Throwable =>
            logger.error(t, "Error when indexing records")
            throw t
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

    val indexDataSet = ElasticDsl.index into indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(Indices.DataSetsIndexType) id dataSet.uniqueId source (
      dataSet.toJson)

    val indexPublisher = dataSet.publisher.flatMap(publisher => publisher.name.filter(!"".equals(_)).map(publisherName =>
      ElasticDsl.indexInto(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(indices.typeForFacet(Publisher)))
        .id(publisherName.toLowerCase)
        .source(Map(
          "identifier" -> publisher.identifier.toJson,
          "value" -> publisherName.toJson).toJson)))

    val indexFormats = dataSet.distributions.filter(dist => dist.format.isDefined && !"".equals(dist.format.get)).map { distribution =>
      val format = distribution.format.get

      ElasticDsl.indexInto(indices.getIndex(config, Indices.DataSetsIndex) / indices.getType(indices.typeForFacet(Format)))
        .id(format.toLowerCase)
        .source(Map("value" -> format).toJson)
    }

    indexDataSet :: indexPublisher.toList ++ indexFormats
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