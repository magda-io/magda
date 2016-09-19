package au.csiro.data61.magda.external

import java.io.IOException

import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future
import scala.xml.NodeSeq

import com.typesafe.config.Config

import akka.actor.ActorSystem
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshallers.xml.ScalaXmlSupport
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._

//class CSWExternalInterface(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends ExternalInterface with ScalaXmlSupport {
//  val logger = Logging(system, getClass)
//
//  implicit def responseConv(res: NodeSeq): SearchResult = {
//    val results = res \ "SearchResults";
//
//    SearchResult(hitCount = Integer parseInt (results \@ "numberOfRecordsMatched"), dataSets = results \ "SummaryRecord")
//  }
//
//  implicit def dataSetConv(res: NodeSeq): List[DataSet] =
//    res map { summaryRecord => DataSet(identifier = summaryRecord \ "identifier" text, description = Some(summaryRecord \ "abstract" text), catalog = "FIND") } toList
//
//  lazy val cswApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
//    Http().outgoingConnection(config.getString("services.find-api.host"), config.getInt("services.find-api.port"))
//
//  def cswRequest(request: HttpRequest): Future[HttpResponse] = Source.single(request).via(cswApiConnectionFlow).runWith(Sink.last)
//
//  override def search(query: String): Future[Either[String, SearchResult]] = {
//    val dirs = config.getString("services.find-api.path")
//    val path = s"""$dirs?service=CSW&version=2.0.2&request=GetRecords&constraintlanguage=CQL_TEXT&constraint=\"AnyText%20LIKE%20%27%$query%%27\"&resultType=results""";
//
//    cswRequest(RequestBuilding.Get(path)).flatMap { response =>
//      response.status match {
//        case OK => Unmarshal(response.entity).to[NodeSeq].map(Right(_))
//        case BadRequest => {
//          response.entity.dataBytes.runWith(Sink.ignore)
//          Future.successful(Left(s"$query: incorrect IP format"))
//        }
//        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
//          val error = s"CSW request failed with status code ${response.status} and entity $entity"
//          logger.error(error)
//          Future.failed(new IOException(error))
//        }
//      }
//    }
//  }
//}