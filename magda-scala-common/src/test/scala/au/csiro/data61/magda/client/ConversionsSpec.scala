package au.csiro.data61.magda.client

import akka.actor.ActorSystem
import org.scalatest.{FunSpec, Matchers}

import scala.io.BufferedSource
import scala.io.Source.fromFile
import spray.json._

import java.io.File
import au.csiro.data61.magda.model.Registry

import scala.util.{Failure, Success, Try}
import java.time.ZoneOffset

class ConversionsSpec extends FunSpec with Matchers {

  implicit val system = ActorSystem()
  val logger = akka.event.Logging.getLogger(system, getClass)

  describe("Test all sample error dataset JSON data without exception thrown") {

    val path = getClass.getResource("/sampleErrorDatasetJson")
    val folder = new File(path.getPath)
    if (folder.exists && folder.isDirectory)
      folder.listFiles.toList
        .foreach[Any](
          file =>
            it(
              s"should convert JSON file: ${file.getName} without exception thrown"
            ) {
              val jsonResSource: BufferedSource = fromFile(file)
              val jsonRes: String =
                try {
                  jsonResSource.mkString
                } finally {
                  jsonResSource.close()
                }
              val dataset = jsonRes.parseJson.convertTo(Registry.recordFormat)
              Try(
                Conversions.convertRegistryDataSet(
                  dataset,
                  Some(logger)
                )(ZoneOffset.UTC)
              ) match {
                case Failure(e) =>
                  fail(s"Failed to parse dataset and throw an exception ${e}")
                case _ =>
              }
            }
        )
  }

  describe("Test all sample NO error dataset JSON data") {

    val path = getClass.getResource("/sampleNoErrorDatasetJson")
    val folder = new File(path.getPath)
    if (folder.exists && folder.isDirectory)
      folder.listFiles.toList
        .foreach[Any](
          file =>
            it(
              s"should convert JSON file: ${file.getName} without exception thrown"
            ) {
              val jsonResSource: BufferedSource = fromFile(file)
              val jsonRes: String =
                try {
                  jsonResSource.mkString
                } finally {
                  jsonResSource.close()
                }
              val dataset = jsonRes.parseJson.convertTo(Registry.recordFormat)
              Try(
                Conversions.convertRegistryDataSet(
                  dataset,
                  None
                )(ZoneOffset.UTC)
              ) match {
                case Failure(e) =>
                  fail(s"Failed to parse dataset and throw an exception ${e}")
                case Success(v) =>
                  v
              }
            }
        )
  }
}
