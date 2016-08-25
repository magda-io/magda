package au.csiro.data61.magda.api

import akka.actor.ActorSystem
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

object Api {
  def apply(implicit config: Config, system: ActorSystem, executor: ExecutionContextExecutor, materializer: Materializer) = new Api()
}

class Api(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContextExecutor, implicit val materializer: Materializer) extends Protocols {
  val logger = Logging(system, getClass)
  val external: ExternalInterface = new FederatedExternalInterface(interfaces = Seq(new CKANExternalInterface(), new CSWExternalInterface()))

  val routes = {
    logRequestResult("akka-http-microservice") {
      pathPrefix("search") {
        (get & path(Segment)) { query =>
          complete {
            external.search(query).map[ToResponseMarshallable] {
              case Right(result)      => result
              case Left(errorMessage) => BadRequest -> errorMessage
            }
          }
        }
      }
    }
  }

  Http().bindAndHandle(routes, config.getString("http.interface"), config.getInt("http.port"))
}