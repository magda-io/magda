package au.csiro.data61.magda.external

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.model._
import akka.stream.Materializer
import akka.stream.scaladsl._
import au.csiro.data61.magda.util.Http.getPort

import scala.concurrent.{ ExecutionContext, Future }

class HttpFetcher(interfaceConfig: InterfaceConfig, implicit val system: ActorSystem,
                  implicit val materializer: Materializer, implicit val ec: ExecutionContext) {

  lazy val connectionFlow = {
    val host = interfaceConfig.baseUrl.getHost
    val port = getPort(interfaceConfig.baseUrl)
    
    interfaceConfig.baseUrl.getProtocol match {
      case "http"  => Http().cachedHostConnectionPool[Int](host, port)
      case "https" => Http().cachedHostConnectionPoolHttps[Int](host, port)
    }
  }

  def request(path: String): Future[HttpResponse] =
    interfaceConfig.fakeConfig match {
      case Some(fakeConfig) => Future {
        val file = scala.io.Source.fromInputStream(getClass.getResourceAsStream(fakeConfig.datasetPath))
        val contentType = fakeConfig.mimeType match {
          case "application/json" => ContentTypes.`application/json`
          case "text/xml"         => ContentTypes.`text/xml(UTF-8)`
        }

        val response = new HttpResponse(
          status = StatusCodes.OK,
          headers = scala.collection.immutable.Seq(),
          protocol = HttpProtocols.`HTTP/1.1`,
          entity = HttpEntity(contentType, file.mkString))

        file.close()

        response
      }
      case None => {
        val url = s"${interfaceConfig.baseUrl.getPath}${path}"
        system.log.debug("Making request to {}{}", interfaceConfig.baseUrl.getHost, url)
        val request = RequestBuilding.Get(url)
        Source.single((request, 0)).via(connectionFlow).runWith(Sink.head).map {
          case (response, _) => response.get
        }
      }
    }
}