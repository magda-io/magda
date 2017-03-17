package au.csiro.data61.magda.search

import au.csiro.data61.magda.model.misc._

import scala.concurrent.{ ExecutionContext, Future }
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.search.elasticsearch.{ ClientProvider, ElasticSearchIndexer, Indices }
import com.typesafe.config.Config
import java.time.Instant
import akka.stream.scaladsl.Source
import akka.NotUsed

trait SearchIndexer {
  def index(source: InterfaceConfig, dataSetStream: Source[DataSet, NotUsed]): Future[SearchIndexer.IndexResult]
  def snapshot(): Future[Unit]
  def ready: Future[Unit]
  def trim(source: InterfaceConfig, before: Instant): Future[Unit]

}

object SearchIndexer {
  case class IndexResult(successes: Long, failures: Seq[String])
  
  def apply(clientProvider: ClientProvider, indices: Indices)(implicit config: Config, system: ActorSystem, ec: ExecutionContext, materializer: Materializer) =
    new ElasticSearchIndexer(clientProvider, indices)
}