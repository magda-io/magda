package au.csiro.data61.magda.api

import akka.actor.ActorSystem
import ch.megard.akka.http.cors.CorsDirectives
import ch.megard.akka.http.cors.CorsSettings
import akka.event.{ LoggingAdapter, Logging }
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.{ HttpResponse, HttpRequest }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.{ ActorMaterializer, Materializer }
import akka.stream.scaladsl.{ Flow, Sink, Source }
import com.typesafe.config.Config
import com.typesafe.config.ConfigFactory
import java.io.IOException
import scala.concurrent.{ ExecutionContextExecutor, Future }
import scala.math._
import spray.json.DefaultJsonProtocol
import au.csiro.data61.magda.api.Types._
import au.csiro.data61.magda.external._
import akka.http.scaladsl.model.headers.HttpOriginRange
import akka.http.scaladsl.server.RejectionHandler
import akka.http.scaladsl.model.headers.Allow
import akka.http.scaladsl.server.MethodRejection
import akka.http.scaladsl.server.Rejection
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.server.ExceptionHandler

object Api {
  def apply(implicit config: Config, system: ActorSystem, executor: ExecutionContextExecutor, materializer: Materializer) = new Api()
}

class Api(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContextExecutor, implicit val materializer: Materializer) extends Protocols with CorsDirectives {
  val logger = Logging(system, getClass)
  val external: ExternalInterface = new FederatedExternalInterface(interfaces = Seq(new CKANExternalInterface(), new CSWExternalInterface()))

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