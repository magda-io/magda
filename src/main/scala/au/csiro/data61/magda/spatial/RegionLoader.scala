package au.csiro.data61.magda.search.elasticsearch

import java.net.URL

import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.model.{ HttpRequest, HttpResponse }
import akka.stream.Materializer
import akka.stream.scaladsl.{ Flow, JsonFraming, Source }
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.util.Http.getPort
import spray.json._
import akka.actor.ActorSystem
import java.io.File
import akka.util.ByteString
import akka.stream.scaladsl.FileIO
import java.nio.file.Paths
import java.net.URI
import akka.stream.scaladsl.Sink
import scala.util.Failure
import scala.concurrent.ExecutionContext
import scala.util.Success
import scala.concurrent.duration._
import au.csiro.data61.magda.AppConfig
import akka.http.scaladsl.settings.ClientConnectionSettings
import com.typesafe.config.ConfigFactory

class RegionLoader(val regionSource: RegionSource, implicit val materializer: Materializer, implicit val actorSystem: ActorSystem) {
  implicit val ec: ExecutionContext = actorSystem.dispatcher

  def toStream(): Source[JsObject, Any] = {
    val splitFlow = JsonFraming.objectScanner(Int.MaxValue)

    getInputSource
      .via(splitFlow)
      .map(byteString => byteString.decodeString("UTF-8"))
      .map(string => string.parseJson)
      .map(jsValue => jsValue.asJsObject)
  }

  private def getInputSource(): Source[ByteString, Any] = {
    val file = new File(s"/usr/regions/${regionSource.name}s.json")

    if (file.exists()) {
      actorSystem.log.info("Found shapes for region {} at {}, loading from there", regionSource.name, file.getPath)
      FileIO.fromPath(file.toPath())
    } else {
      actorSystem.log.info("Could not find shapes for {} at {}, loading from {} and caching to {} instead", regionSource.name, file.getPath, regionSource.url, file.getPath)
      file.getParentFile.mkdirs()
      file.createNewFile()

      val clientSettings = ClientConnectionSettings(AppConfig.conf).withIdleTimeout(30 minutes)

      val connectionFlow: Flow[HttpRequest, HttpResponse, Any] =
        Http().outgoingConnection(regionSource.url.getHost, getPort(regionSource.url), settings = clientSettings)
      val request = RequestBuilding.Get(regionSource.url.toString)

      actorSystem.log.info("Indexing regions from {}", regionSource.url)

      // Here we use an akka stream to read the file chunk by chunk and pass it down the stream to the parser.
      Source.single(request)
        .via(connectionFlow)
        .flatMapConcat(
          _.entity.withoutSizeLimit().dataBytes
        )
        .alsoTo(FileIO.toPath(file.toPath()))
        .recover {
          case e: Throwable =>
            actorSystem.log.info("Encountered error {} while downloading shapes for {}, deleting {}", e.getMessage, regionSource.name, file.getPath)
            file.delete()
            throw e
        }

    }
  }
}

object RegionLoader {

  /**
   * Reads the ABS regions in from a gigantic (165mb!!) GeoJSON file that we download as part of the build, and
   * indexes them into ES
   */
  def loadABSRegions(regionSource: RegionSource)(implicit materializer: Materializer, actorSystem: ActorSystem): Source[JsObject, Any] = {
    new RegionLoader(regionSource, materializer, actorSystem).toStream()
  }
}
