package au.csiro.data61.magda.indexer.crawler

import akka.actor.ActorSystem
import akka.http.scaladsl.model.StatusCodes.{
  Accepted,
  Conflict,
  InternalServerError,
  OK
}
import akka.http.scaladsl.server.Directives._
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.indexer.search.SearchIndexer
import com.typesafe.config.Config
import au.csiro.data61.magda.directives.AuthDirectives.requireUnconditionalAuthDecision

import scala.concurrent.Future
import scala.util.{Failure, Success}

class CrawlerApi(
    crawler: Crawler,
    indexer: SearchIndexer,
    authApiClient: AuthApiClient
)(
    implicit system: ActorSystem,
    config: Config
) extends BaseMagdaApi {
  implicit val ec = system.dispatcher
  val indexerEc = system.dispatchers.lookup("indexer.main-dispatcher")
  override def getLogger = system.log

  val routes =
    magdaRoute {

      path("snapshot") {
        post {
          requireUnconditionalAuthDecision(
            authApiClient,
            AuthDecisionReqConfig(operationUri = "api/indexer/reindex/snapshot")
          ) {
            indexer.snapshot()
            complete(Accepted)
          }
        }
      } ~
        /**
          * @apiGroup Indexer
          * @api {get} /v0/indexer/reindex/in-progress Check reindex progress
          *
          * @apiDescription Reveals whether the indexer is currently reindexing. Returns a simple text "true" or "false".
          * requires permission to operation uri `api/indexer/reindex/in-progress`
          *
          * @apiSuccess (Success 200) {String} Response `true` or `false`
          * @apiUse GenericError
          */
        path("in-progress") {
          get {
            requireUnconditionalAuthDecision(
              authApiClient,
              AuthDecisionReqConfig(
                operationUri = "api/indexer/reindex/in-progress"
              )
            ) {
              complete(OK, crawler.crawlInProgress().toString)
            }
          }
        } ~
        /**
          * @apiGroup Indexer
          * @api {post} /v0/indexer/reindex Trigger reindex
          *
          * @apiDescription Triggers a new reindex, if possible. This means that all datasets and organisations in the
          * registry will be reingested into the ElasticSearch index, and any not present in the registry will be deleted
          * from ElasticSearch.
          *
          * If this is already in progress, returns 409.
          *
          * Requires permission to operation uri `api/indexer/reindex`
          *
          * @apiSuccess (Success 202) {String} Response (blank)
          * @apiError (Error 409) {String} Response "Reindex in progress"
          * @apiUse GenericError
          */
        post {
          requireUnconditionalAuthDecision(
            authApiClient,
            AuthDecisionReqConfig(
              operationUri = "api/indexer/reindex"
            )
          ) {
            onComplete(Future(crawl)(indexerEc)) {
              case Success(result) =>
                if (result) complete(Accepted)
                else complete(Conflict, "Reindex in progress")
              case Failure(ex) =>
                complete(
                  InternalServerError,
                  s"An error occurred: ${ex.getMessage}"
                )
            }
          }
        }
    }

  def crawl(): Boolean = {
    if (crawler.crawlInProgress()) {
      false
    } else {
      crawler
        .crawl()
        .onComplete {
          case Success(_) =>
            getLogger.info("Successfully completed crawl")
          case Failure(e) =>
            getLogger.error(e, "Crawl failed")
        }
      true
    }
  }
}
