package au.csiro.data61.magda.search.elasticsearch

import java.io.File

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt

import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.settings.ClientConnectionSettings
import akka.stream.Materializer
import akka.stream.scaladsl.FileIO
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.JsonFraming
import akka.stream.scaladsl.Source
import akka.util.ByteString
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.spatial.RegionSource
import au.csiro.data61.magda.util.Http.getPort
import spray.json.JsObject
import spray.json.pimpString
import akka.http.scaladsl.settings.ConnectionPoolSettings
import scala.util.Try
import akka.stream.OverflowStrategy
import akka.stream.scaladsl.Keep
import scala.util.Failure
import akka.stream.scaladsl.Sink
import scala.util.Success
import scala.concurrent.Promise
import akka.stream.scaladsl.SourceQueue
import scala.concurrent.Future
import com.sksamuel.elastic4s.TcpClient
import com.sksamuel.elastic4s.ElasticDsl
import spray.json.JsString
import akka.stream.IOResult
import au.csiro.data61.magda.spatial.RegionSources
import com.typesafe.config.Config

class RegionLoader(regionSources: List[RegionSource])(implicit val config: Config, implicit val system: ActorSystem, implicit val materializer: Materializer) {
  implicit val ec = system.dispatcher
  val pool = Http().superPool[Int]()

  def loadABSRegions(regionSource: RegionSource): Future[File] = {
    val file = new File(s"${config.getString("regionLoading.cachePath")}/${regionSource.name}.json")

    if (file.exists()) {
      system.log.info("Found shapes for region {} at {}, loading from there", regionSource.name, file.getPath)
      Future(file)
    } else {
      system.log.info("Could not find shapes for {} at {}, loading from {} and caching to {} instead", regionSource.name, file.getPath, regionSource.url, file.getPath)
      file.getParentFile.mkdirs()
      file.createNewFile()

      val request = RequestBuilding.Get(regionSource.url.toString)

      system.log.info("Indexing regions from {}", regionSource.url)

      Source.single((request, 0))
        .via(pool)
        .flatMapConcat {
          case (response, _) =>
            response.get.entity.withoutSizeLimit().dataBytes
        }
        .runWith(FileIO.toPath(file.toPath()))
        .recover {
          case e: Throwable =>
            system.log.info("Encountered error {} while downloading shapes for {}, deleting {}", e.getMessage, regionSource.name, file.getPath)
            file.delete()
            throw e
        }
        .map(_ => file)
    }
  }

  def setupRegions(): Source[(RegionSource, JsObject), _] = {
    Source(regionSources)
      .mapAsync(4)(regionSource => loadABSRegions(regionSource).map((_, regionSource)))
      .flatMapConcat {
        case (file, regionSource) =>
          val splitFlow = JsonFraming.objectScanner(Int.MaxValue)

          FileIO.fromPath(file.toPath(), 262144)
            .via(splitFlow)
            .map(byteString => byteString.decodeString("UTF-8"))
            .map(string => string.parseJson)
            .map(jsValue => (regionSource, jsValue.asJsObject))
      }
  }
}

