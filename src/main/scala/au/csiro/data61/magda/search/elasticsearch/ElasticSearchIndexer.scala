
package au.csiro.data61.magda.search.elasticsearch

import akka.stream.Materializer
import akka.actor.ActorSystem
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.search.SearchIndexer
import akka.stream.OverflowStrategy
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticsearchClientUri
import java.time.Instant
import au.csiro.data61.magda.model.misc._
import java.time.LocalDate
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import scala.concurrent.Future
import java.time.ZoneId
import com.sksamuel.elastic4s.ElasticDsl
import org.elasticsearch.index.IndexNotFoundException
import org.elasticsearch.transport.RemoteTransportException
import au.csiro.data61.magda.model.misc.Protocols._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import com.sksamuel.elastic4s.ElasticDsl._
import spray.json._
import au.csiro.data61.magda.search.elasticsearch.ClientProvider.getClient
import com.sksamuel.elastic4s.BulkResult
import au.csiro.data61.magda.util.FutureRetry.retry
import scala.concurrent.duration._
import com.sksamuel.elastic4s.BulkDefinition
import akka.stream.scaladsl.SourceQueueWithComplete
import akka.stream.scaladsl.SourceQueue
import akka.stream.QueueOfferResult

class ElasticSearchIndexer(implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends SearchIndexer {
  val logger = system.log

  /**
   * Returns an initialised {@link ElasticClient} on completion. Using this to get the client rather than just keeping a reference to an initialised client
   *  ensures that all queries will only complete after the client is initialised.
   */
  private lazy val setupFuture = setup()

  implicit val scheduler = system.scheduler

  // This needs to be a queue here because if we queue more than 50 requests into ElasticSearch it gets very very mad.
  private lazy val indexQueue: SourceQueue[(String, Seq[DataSet])] =
    Source.queue[(String, Seq[DataSet])](0, OverflowStrategy.backpressure)
      .mapAsync(1) {
        case (source, dataSets) =>
          bulkIndex(buildDatasetIndexDefinition(dataSets))
            .map((source, dataSets.length, _))
      }
      .map {
        case (source, dataSetCount, result) =>
          if (result.hasFailures) {
            logger.warning("Failure when indexing from {}: {}", source, result.failureMessage)
          } else {
            logger.info("Indexed {} datasets from {}", dataSetCount, source)
          }

          result
      }
      .recover {
        case e: Throwable =>
          logger.error(e, "Error when indexing: {}", e.getMessage)
      }
      .to(Sink.last)
      .run()

  /** Initialises an {@link ElasticClient}, handling initial connection to the ElasticSearch server and creation of the indices */
  private def setup(): Future[ElasticClient] = {
    getClient(system.scheduler, logger, ec).flatMap(client =>
      retry(() => getIndexVersions(client), 10 seconds, 10, logger.warning("Failed to get index versions, {} retries left", _))
        .flatMap { versionPairs =>
          updateIndices(client, versionPairs).map { _ =>
            // If we've got to here everything has gone swimmingly - the index is all ready to have data loaded, so return the client for other methods to play with :)
            client
          }
        }
    )
  }

  /**
   * Returns a future that gets a seq of each index paired with its current version number in ES
   */
  private def getIndexVersions(client: ElasticClient) = Future.sequence(
    IndexDefinition.indices.map(indexDef =>
      client.execute(get id "indexversion" from indexDef.name / "config")
        .map(x => if (x.isSourceEmpty || !x.isExists) 0 else x.source.get("version").asInstanceOf[Int])
        .recover {
          // If the index wasn't found that's fine, we'll just recreate it. Otherwise log an error - every subsequent request to the provider will fail with this exception.
          case outer: RemoteTransportException => outer.getCause match {
            case (inner: IndexNotFoundException) =>
              logger.warning("{} index was not present, if this is the first boot with a new index version this is fine: {}", indexDef.name, outer.getMessage)
              0
          }
        }))
    .map(versions => versions.zip(IndexDefinition.indices))

  /**
   * Compares the passed index versions with those of the codebase - if there's a mismatch then it deletes the index from ES and rebuilds it.
   */
  private def updateIndices(client: ElasticClient, versionPairs: Seq[(Int, IndexDefinition)]): Future[Object] =
    Future.sequence(versionPairs.map {
      case (indexVersion, definition) =>
        logger.info("{} index version is {}", definition.name, indexVersion)

        // If the index version on ES is lower than the code's version, wipe it all and start again.
        if (indexVersion != definition.version) {
          val deleteIndex =
            client.execute {
              delete index definition.name
            } recover {
              case outer: RemoteTransportException => outer.getCause match {
                case (inner: IndexNotFoundException) => {
                  // Meh, we were trying to delete it anyway.
                }
                case inner: RemoteTransportException => inner.getCause match {
                  case (inner: IndexNotFoundException) => {
                    // Meh, we were trying to delete it anyway.
                  }
                }
                case e =>
                  logger.debug("Inner exception class {}", e.getClass.toString)
                  throw e
              }
              case e =>
                logger.debug("Exception class {}", e.getClass.toString)
                throw e
            }

          deleteIndex flatMap { _ =>
            client.execute(definition.definition)
          } recover {
            case e: Throwable =>
              logger.error(e, "Failed to set up the index")
              throw e
          } flatMap { _ =>
            logger.info("Index {} version {} created", definition.name, definition.version)

            definition.create(client, materializer, system).flatMap { _ =>
              // Now we've created the index, record the version of it so we can look at it next time we boot up.
              logger.info("Recording index version")

              client.execute {
                ElasticDsl.index into definition.name / "config" id "indexversion" source Map("version" -> definition.version).toJson
              }
            }
          }
        } else Future.successful(Right(Unit))
    })

  /** Returns a list of all years between two Instants, inclusively, as strings */
  def getYears(from: Option[Instant], to: Option[Instant]): List[Int] = {
    def getYearsInner(from: LocalDate, to: LocalDate): List[Int] =
      if (from.isAfter(to)) {
        Nil
      } else {
        from.getYear :: getYearsInner(from.plusYears(1), to)
      }

    (from, to) match {
      case (None, None) => Nil
      case _ => {
        val newFrom = from.getOrElse(to.get).atZone(ZoneId.systemDefault).toLocalDate
        val newTo = to.getOrElse(from.get).atZone(ZoneId.systemDefault).toLocalDate

        getYearsInner(newFrom, newTo)
      }
    }
  }

  override def index(source: String, dataSets: List[DataSet]) = if (dataSets.length > 0) {
    indexQueue.offer((source, dataSets))
      .map {
        case QueueOfferResult.Enqueued    => QueueOfferResult.Enqueued
        case QueueOfferResult.Dropped     => throw new Exception("Dropped")
        case QueueOfferResult.QueueClosed => throw new Exception("Queue Closed")
        case QueueOfferResult.Failure(e)  => throw e
      }
  } else {
    Future(None)
  }

  override def needsReindexing(): Future[Boolean] = {
    setupFuture.flatMap(client =>
      retry(() =>
        client.execute {
          ElasticDsl.search in "datasets" / "datasets" limit 0
        }, 10 seconds, 10, logger.warning("Failed to get dataset count, {} retries left", _))
        .map { result =>
          logger.debug("Reindex check hit count: {}", result.getHits.getTotalHits)
          result.getHits.getTotalHits == 0
        }
    )
  }

  private def bulkIndex(definition: BulkDefinition): Future[BulkResult] =
    setupFuture.flatMap(client =>
      client.execute(definition)
        .recover {
          case t: Throwable =>
            logger.error(t, "Error when indexing records")
            throw t
        })

  /**
   * Indexes a number of datasets into ES using a bulk insert.
   */
  private def buildDatasetIndexDefinition(dataSets: Seq[DataSet]): BulkDefinition =
    bulk(
      dataSets.map { dataSet =>
        val indexDataSet = ElasticDsl.index into "datasets" / "datasets" id dataSet.uniqueId source (
          dataSet.copy(
            years = getYears(dataSet.temporal.flatMap(_.start.flatMap(_.date)), dataSet.temporal.flatMap(_.end.flatMap(_.date))) match {
              case Nil  => None
              case list => Some(list)
            }).toJson)

        val indexPublisher = dataSet.publisher.flatMap(_.name.map(publisherName =>
          ElasticDsl.index into "datasets" / Publisher.id
            id publisherName.toLowerCase
            source Map("value" -> publisherName).toJson))

        val indexYears = getYears(
          dataSet.temporal.flatMap(_.start.flatMap(_.date)),
          dataSet.temporal.flatMap(_.end.flatMap(_.date))).map(year => ElasticDsl.index into "datasets" / Year.id id year source Map("value" -> year).toJson)

        val indexFormats = dataSet.distributions.filter(_.format.isDefined).map { distribution =>
          val format = distribution.format.get

          ElasticDsl.index into "datasets" / Format.id id format.toLowerCase source Map("value" -> format).toJson
        }

        indexDataSet :: indexYears ++ indexPublisher.toList ++ indexFormats
      }.flatten)

}