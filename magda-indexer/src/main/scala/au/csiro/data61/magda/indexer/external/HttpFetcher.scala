package au.csiro.data61.magda.indexer.external

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.Try

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.ContentTypes
import akka.http.scaladsl.model.HttpEntity
import akka.http.scaladsl.model.HttpProtocols
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.util.Http.getPort

class HttpFetcher(interfaceConfig: InterfaceConfig)(implicit val system: ActorSystem,
                                                    val materializer: Materializer, val ec: ExecutionContext) {

  lazy val connectionFlow: Flow[(HttpRequest, Int), (Try[HttpResponse], Int), _] = {
    val host = interfaceConfig.baseUrl.getHost
    val port = getPort(interfaceConfig.baseUrl)

    interfaceConfig.baseUrl.getProtocol match {
      case "http"  => Http().cachedHostConnectionPool[Int](host, port)
      case "https" => Http().cachedHostConnectionPoolHttps[Int](host, port)
    }
  }

  def get(path: String): Future[HttpResponse] =
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

  def post[T](path: String, payload: T)(implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = {
    val url = s"${interfaceConfig.baseUrl.getPath}${path}"
    system.log.debug("Making request to {}{} with {}", interfaceConfig.baseUrl.getHost, url, payload)
    val request = RequestBuilding.Post(url, payload)
    Source.single((request, 0)).via(connectionFlow).runWith(Sink.head).map {
      case (response, _) => response.get
    }
  }
}