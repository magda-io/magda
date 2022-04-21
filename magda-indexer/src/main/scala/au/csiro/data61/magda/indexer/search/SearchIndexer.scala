package au.csiro.data61.magda.indexer.search

import au.csiro.data61.magda.model.misc._

import scala.concurrent.{ExecutionContext, Future, Promise}
import akka.stream.Materializer
import akka.actor.ActorSystem
import au.csiro.data61.magda.search.elasticsearch.{ClientProvider, Indices}
import com.typesafe.config.Config

import java.time.Instant
import akka.stream.scaladsl.Source
import akka.NotUsed

import java.time.OffsetDateTime
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.indexer.crawler.RegistryCrawler
import au.csiro.data61.magda.search.elasticsearch.IndexDefinition

trait SearchIndexer {

  /**
    * Provide simple / alternative interface and call `performIndex`` to perform index action
    * @param dataSetStream
    * @return
    */
  def index(
      dataSetStream: Source[DataSet, NotUsed]
  ): Future[SearchIndexer.IndexResult]

  /**
    * Teh actual method to perform index action
    * @param dataSetStream
    * @param retryFailedDatasets
    * @return
    */
  def performIndex(
      dataSetStream: Source[(DataSet, Promise[Unit]), NotUsed],
      retryFailedDatasets: Boolean = true
  ): Future[SearchIndexer.IndexResult]

  def delete(identifiers: Seq[String]): Future[Unit]
  def snapshot(): Future[Unit]
  def ready: Future[Unit]
  def trim(before: OffsetDateTime): Future[Unit]
  def isEmpty(index: Indices.Index): Future[Boolean]
  var isReady: Boolean
  def refreshIndex(index: Indices.Index): Future[Unit]
}

object SearchIndexer {
  case class IndexResult(
      // no. of successfully indexed datasets
      successes: Long = 0,
      // no. of failures
      failures: Long = 0,
      // no .of datasets that are indexed with warns (e.g. after retry)
      warns: Long = 0,
      failureReasons: Seq[String] = Seq(),
      warnReasons: Seq[String] = Seq()
  )

  def apply(clientProvider: ClientProvider, indices: Indices)(
      implicit config: Config,
      system: ActorSystem,
      ec: ExecutionContext,
      materializer: Materializer
  ) =
    new ElasticSearchIndexer(clientProvider, indices)
}
