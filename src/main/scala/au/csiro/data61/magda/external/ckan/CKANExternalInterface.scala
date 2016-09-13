package au.csiro.data61.magda.external

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
import au.csiro.data61.magda.api.Types._
import java.time.Instant
import spray.json.JsonReader
import scala.concurrent.ExecutionContext
import java.net.URL
import au.csiro.data61.magda.external.ckan._

class CKANExternalInterface(baseUrl: URL, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface {
  implicit val logger = Logging(system, getClass)

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(baseUrl.getHost, getPort)

  def getPort = if (baseUrl.getPort == -1) 80 else baseUrl.getPort

  def ckanRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)

  def getDataSets(start: Long, number: Int): scala.concurrent.Future[List[DataSet]] = ckanRequest(RequestBuilding.Get(s"${baseUrl.getPath}action/package_search?start=$start&rows=$number")).flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.results)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        Future.failed(new IOException(error))
      }
    }
  }

  def getTotalDataSetCount(): scala.concurrent.Future[Long] = ckanRequest(RequestBuilding.Get(s"${baseUrl.getPath}action/package_search?rows=0")).flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.count)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        logger.error(error)
        Future.failed(new IOException(error))
      }
    }
  }
}