package au.csiro.data61.magda.external

import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpHeader
import akka.http.scaladsl.model.HttpProtocols
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes
import akka.stream.Materializer
import akka.stream.scaladsl._
import akka.http.scaladsl.model.ContentTypes

class HttpFetcher(interfaceConfig: InterfaceConfig, implicit val system: ActorSystem, implicit val materializer: Materializer, implicit val ec: ExecutionContext) {

  lazy val ckanApiConnectionFlow: Flow[HttpRequest, HttpResponse, Any] =
    Http().outgoingConnection(interfaceConfig.baseUrl.getHost, getPort)

  private def getPort = if (interfaceConfig.baseUrl.getPort == -1) 80 else interfaceConfig.baseUrl.getPort

  def request(path: String): Future[HttpResponse] =
    interfaceConfig.fakeConfig match {
      case Some(fakeConfig) => Future {
        val file = io.Source.fromInputStream(getClass.getResourceAsStream(fakeConfig.datasetPath))
        
        val response = new HttpResponse(
            status = StatusCodes.OK,
            headers = scala.collection.immutable.Seq(),
            protocol = HttpProtocols.`HTTP/1.1`,
            entity = HttpEntity(ContentTypes.`application/json`, file.mkString)
        )
        
        file.close()
        
        response
      }
      case None             => {
        val request = RequestBuilding.Get(s"${interfaceConfig.baseUrl.getPath}${path}")
        Source.single(request).via(ckanApiConnectionFlow).runWith(Sink.head)
      }
    }
}