package au.csiro.data61.magda.client

import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import scala.util.Try
import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshalling.ToEntityMarshaller
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.util.Http.getPort
import java.net.URL

class HttpFetcher(baseUrl: URL)(implicit val system: ActorSystem,
                                val materializer: Materializer, val ec: ExecutionContext) {
  lazy val connectionFlow: Flow[(HttpRequest, Int), (Try[HttpResponse], Int), _] = {
    val host = baseUrl.getHost
    val port = getPort(baseUrl)

    baseUrl.getProtocol match {
      case "http"  => Http().cachedHostConnectionPool[Int](host, port)
      case "https" => Http().cachedHostConnectionPoolHttps[Int](host, port)
    }
  }

  def get(path: String): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug("Making request to {}{}", baseUrl.getHost, url)
    val request = RequestBuilding.Get(url)
    Source.single((request, 0)).via(connectionFlow).runWith(Sink.head).map {
      case (response, _) => response.get
    }
  }

  def post[T](path: String, payload: T)(implicit m: ToEntityMarshaller[T]): Future[HttpResponse] = {
    val url = s"${baseUrl.getPath}${path}"
    system.log.debug("Making request to {}{} with {}", baseUrl.getHost, url, payload)
    val request = RequestBuilding.Post(url, payload)
    Source.single((request, 0)).via(connectionFlow).runWith(Sink.head).map {
      case (response, _) => response.get
    }
  }
}