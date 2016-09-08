package au.csiro.data61.magda.api

import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

import com.typesafe.config.Config

import akka.actor.ActorSystem
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.Http
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.ExceptionHandler
import akka.http.scaladsl.server.MethodRejection
import akka.http.scaladsl.server.Rejection
import akka.http.scaladsl.server.RejectionHandler
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.external._
import ch.megard.akka.http.cors.CorsDirectives
import ch.megard.akka.http.cors.CorsSettings
import java.net.URL
import scala.concurrent.ExecutionContext

object Api {
  def apply(implicit config: Config, system: ActorSystem, executor: ExecutionContextExecutor, materializer: Materializer) = new Api()
}

class Api(implicit val config: Config, implicit val system: ActorSystem, implicit val ec: ExecutionContext, implicit val materializer: Materializer) extends Protocols with CorsDirectives {
  val logger = Logging(system, getClass)
  val external: ExternalInterface = new CKANExternalInterface(new URL(config.getString("services.dga-api.baseUrl")), system, ec, materializer)

  implicit def rejectionHandler = RejectionHandler.newBuilder()
    .handleAll[MethodRejection] { rejections =>
      val methods = rejections map (_.supported)
      lazy val names = methods map (_.name) mkString ", "

      cors() {
        options {
          complete(s"Supported methods : $names.")
        } ~
          complete(MethodNotAllowed,
            s"HTTP method not allowed, supported methods: $names!")
      }
    }
    .result()

  val myExceptionHandler = ExceptionHandler {
    case e: Exception => {
      logger.error(e, "Exception encountered")

      cors() {
        complete(HttpResponse(InternalServerError, entity = "You are probably seeing this message because Alex messed up"))
      }
    }
  }

  val routes = cors() {
    handleExceptions(myExceptionHandler) {
      pathPrefix("search") {
        (get & parameters("query")) { (query) =>
          val search = external.search(query)
          //TODO: Directive for this repeated code?

          pathPrefix("datasets") {
            complete {
              search.map[ToResponseMarshallable] {
                case Right(result)      => result.copy(facets = None)
                case Left(errorMessage) => BadRequest -> errorMessage
              }
            }
          } ~ pathPrefix("facets") {
            complete {
              search.map[ToResponseMarshallable] {
                case Right(result: SearchResult) => result.facets
                case Left(errorMessage)          => BadRequest -> errorMessage
              }
            }
          } ~ pathEnd {
            complete {
              search.map[ToResponseMarshallable] {
                case Right(result: SearchResult) => result
                case Left(errorMessage)          => BadRequest -> errorMessage
              }
            }
          }
        }
      }
    }
  }

  Http().bindAndHandle(routes, config.getString("http.interface"), config.getInt("http.port"))
}