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

class RegionLoader(implicit val system: ActorSystem, implicit val materializer: Materializer) {
  implicit val ec = system.dispatcher
  val clientSettings = ConnectionPoolSettings(AppConfig.conf).withIdleTimeout(30 minutes)
  val pool = Http().superPool[Int](settings = clientSettings)
  val queue = Source.queue[(RegionSource, Promise[File])](10, OverflowStrategy.backpressure)
    .mapAsync(4) {
      case (regionSource, promise) =>
        val file = new File(s"/usr/regions/${regionSource.name}.json")

        if (file.exists()) {
          system.log.info("Found shapes for region {} at {}, loading from there", regionSource.name, file.getPath)
          Future((file, promise))
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
                promise.failure(e)
                throw e
            }
            .map(_ => (file, promise))
        }
    }
    .map {
      case (file, promise) => promise.success(file)
    }
    .to(Sink.ignore)
    .run()

  /**
   * Reads the ABS regions in from gigantic files and indexes them into ES
   */
  def loadABSRegions(regionSource: RegionSource)(implicit materializer: Materializer, actorSystem: ActorSystem): Source[JsObject, Any] = {
    val splitFlow = JsonFraming.objectScanner(Int.MaxValue)
    val promise = Promise[File]
    queue.offer((regionSource, promise))

    Source.fromFuture(promise.future)
      .flatMapConcat(file => FileIO.fromPath(file.toPath()))
      .via(splitFlow)
      .map(byteString => byteString.decodeString("UTF-8"))
      .map(string => string.parseJson)
      .map(jsValue => jsValue.asJsObject)
  }
}

