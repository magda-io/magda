import akka.actor.ActorSystem
import akka.event.{LoggingAdapter, Logging}
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.{HttpResponse, HttpRequest}
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.{ActorMaterializer, Materializer}
import akka.stream.scaladsl.{Flow, Sink, Source}
import com.typesafe.config.Config
import com.typesafe.config.ConfigFactory
import java.io.IOException
import scala.concurrent.{ExecutionContextExecutor, Future}
import scala.math._
import spray.json.DefaultJsonProtocol

case class SearchResponse(success: Boolean, result: SearchResult)
case class SearchResult(count: Int)
case class SearchHit(title: String, url: String)

trait Protocols extends DefaultJsonProtocol {
  implicit val searchHitFormat = jsonFormat2(SearchHit.apply)
  implicit val searchResultFormat = jsonFormat1(SearchResult.apply)
  implicit val searchResponseFormat = jsonFormat2(SearchResponse.apply)
}

trait Service extends Protocols {
  implicit val system: ActorSystem
  implicit def executor: ExecutionContextExecutor
  implicit val materializer: Materializer

  def config: Config
  val logger: LoggingAdapter

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(config.getString("services.ckan-api.host"), config.getInt("services.ckan-api.port"))

  def ipApiRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)

  def ckanSearch(query: String): Future[Either[String, SearchResponse]] = {
    ipApiRequest(RequestBuilding.Get(s"/api/3/action/package_search?q=$query")).flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[SearchResponse].map(Right(_))
        case BadRequest => Future.successful(Left(s"$query: incorrect IP format"))
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val error = s"FreeGeoIP request failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
  }

  val routes = {
    logRequestResult("akka-http-microservice") {
      pathPrefix("search") {
        (get & path(Segment)) { query =>
          complete {
            ckanSearch(query).map[ToResponseMarshallable] {
              case Right(ipInfo) => ipInfo
              case Left(errorMessage) => BadRequest -> errorMessage
            }
          }
        }
      }
    }
  }
}

object AkkaHttpMicroservice extends App with Service {
  override implicit val system = ActorSystem()
  override implicit val executor = system.dispatcher
  override implicit val materializer = ActorMaterializer()

  override val config = ConfigFactory.load()
  override val logger = Logging(system, getClass)

  Http().bindAndHandle(routes, config.getString("http.interface"), config.getInt("http.port"))
}
