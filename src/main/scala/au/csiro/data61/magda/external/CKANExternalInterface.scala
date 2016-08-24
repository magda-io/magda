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
import spray.json.DefaultJsonProtocol
import au.csiro.data61.magda.api.Types._

case class CKANSearchResponse(success: Boolean, result: CKANSearchResult)
case class CKANSearchResult(count: Int, results: List[CKANSearchHit])
case class CKANSearchHit(title: String, url: String)

trait CKANProtocols extends DefaultJsonProtocol {
  implicit val searchHitFormat = jsonFormat2(CKANSearchHit.apply)
  implicit val searchResultFormat = jsonFormat2(CKANSearchResult.apply)
  implicit val searchResponseFormat = jsonFormat2(CKANSearchResponse.apply)
}

object CKANExternalInterface {
  def apply(implicit config: Config, system: ActorSystem, executor: ExecutionContextExecutor, materializer: Materializer) = new CKANExternalInterface()
}

class CKANExternalInterface(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContextExecutor, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface {
  implicit val logger = Logging(system, getClass)
  implicit def ckanSearchConv(ckanResponse: CKANSearchResponse): SearchResult = SearchResult(hitCount = ckanResponse.result.count, dataSets = ckanResponse.result.results)
  implicit def ckanDataSetConv(hit: CKANSearchHit): DataSet = DataSet(title = hit.title, description = hit.url)
  implicit def ckanDataSetListConv(l: List[CKANSearchHit]): List[DataSet] = l map ckanDataSetConv

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(config.getString("services.ckan-api.host"), config.getInt("services.ckan-api.port"))

  def ckanRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)

  def search(query: String): Future[Either[String, SearchResult]] = {
    ckanRequest(RequestBuilding.Get(s"/api/3/action/package_search?q=$query")).flatMap { response =>
      response.status match {
        case OK         => Unmarshal(response.entity).to[CKANSearchResponse].map(Right(_))
        case BadRequest => Future.successful(Left(s"$query: incorrect IP format"))
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val error = s"CKAN request failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
  }
}