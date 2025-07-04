package au.csiro.data61.magda.spatial

import java.io.File
import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.model._
import akka.stream.Materializer
import akka.stream.scaladsl.FileIO
import akka.stream.scaladsl.JsonFraming
import akka.stream.scaladsl.{Sink, Source}
import spray.json.JsObject
import spray.json._
import scala.concurrent.Future
import com.typesafe.config.Config
import scala.util.{Failure, Success}
import au.csiro.data61.magda.util.RichConfig._

trait RegionLoader {
  def setupRegions(): Source[(RegionSource, JsObject), _]
}

object RegionLoader {

  def apply(
      regionSources: List[RegionSource]
  )(implicit config: Config, system: ActorSystem, materializer: Materializer) =
    new FileRegionLoader(regionSources)
}

class FileRegionLoader(regionSources: List[RegionSource])(
    implicit val config: Config,
    implicit val system: ActorSystem,
    implicit val materializer: Materializer
) extends RegionLoader {
  implicit val ec = system.dispatcher
  val pool = Http().superPool[Int]()

  val fileProcessingParallelism =
    config.getOptionalInt("regionLoader.fileProcessingParallelism").getOrElse(1)

  def sendRequestWithRedirects(
      uri: Uri,
      maxRedirects: Int = 5
  ): Future[HttpResponse] = {
    def requestLoop(
        currentUri: Uri,
        remainingRedirects: Int
    ): Future[HttpResponse] = {
      val request = RequestBuilding.Get(currentUri.toString)
      Source
        .single((request, 0))
        .via(pool)
        .runWith(Sink.head)
        .flatMap {
          case (Success(response), _) =>
            response.status match {
              case StatusCodes.MovedPermanently | StatusCodes.Found |
                  StatusCodes.SeeOther | StatusCodes.TemporaryRedirect |
                  StatusCodes.PermanentRedirect if remainingRedirects > 0 =>
                response.header[headers.Location] match {
                  case Some(locationHeader) =>
                    val newUri = locationHeader.uri
                    response.discardEntityBytes() // Clean up response entity
                    requestLoop(newUri, remainingRedirects - 1)
                  case None =>
                    Future.failed(
                      new RuntimeException(
                        "Redirect response missing Location header"
                      )
                    )
                }
              case _ => Future.successful(response)
            }
          case (Failure(exception), _) =>
            Future.failed(exception)
        }
    }
    requestLoop(uri, maxRedirects)
  }

  def loadABSRegions(regionSource: RegionSource): Future[File] = {

    val file = new File(
      s"${config.getString("regionLoading.cachePath")}/${regionSource.name}.json"
    )

    if (file.exists()) {
      system.log.info(
        "Found shapes for region {} at {}, loading from there",
        regionSource.name,
        file.getPath
      )
      Future(file)
    } else {
      system.log.info(
        "Could not find shapes for {} at {}, loading from {} and caching to {} instead",
        regionSource.name,
        file.getPath,
        regionSource.url,
        file.getPath
      )
      file.getParentFile.mkdirs()
      file.createNewFile()

      system.log.info("Indexing regions from {}", regionSource.url)

      sendRequestWithRedirects(regionSource.url.toString)
        .flatMap { response =>
          val fileSink = FileIO.toPath(file.toPath())
          response.entity.withoutSizeLimit().dataBytes.runWith(fileSink)
        }
        .flatMap { ioResult =>
          if (ioResult.wasSuccessful) {
            Future.successful(file)
          } else {
            Future.failed(
              new RuntimeException(
                s"Failed to write file: ${ioResult.getError.getMessage}"
              )
            )
          }
        }
        .recover {
          case e: Throwable =>
            system.log.info(
              "Encountered error {} while downloading shapes for {}, deleting {}",
              e.getMessage,
              regionSource.name,
              file.getPath
            )
            file.delete()
            throw e
        }
    }
  }

  override def setupRegions(): Source[(RegionSource, JsObject), _] = {
    Source(regionSources)
      .mapAsyncUnordered(fileProcessingParallelism)(
        regionSource => loadABSRegions(regionSource).map((_, regionSource))
      )
      .flatMapConcat {
        case (file, regionSource) =>
          val splitFlow = JsonFraming.objectScanner(Int.MaxValue)

          FileIO
            .fromPath(file.toPath(), 262144)
            .via(splitFlow)
            .map(byteString => byteString.decodeString("UTF-8"))
            .map(string => string.parseJson)
            .map(jsValue => (regionSource, jsValue.asJsObject))
            .recover {
              case ex: Exception =>
                system.log.error(
                  s"region file processing failed: ${ex.getMessage}"
                )
                throw ex
            }
      }
  }
}
