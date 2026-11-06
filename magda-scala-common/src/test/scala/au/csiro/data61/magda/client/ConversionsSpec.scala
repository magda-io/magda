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

  describe("distribution publishing states") {
    Seq("published", "draft").foreach { parentState =>
      it(s"preserves each child's own state under a $parentState dataset") {
        val childStates = Seq(
          "draft-child" -> Some("draft"),
          "published-child" -> Some("published"),
          "legacy-child" -> None
        )
        val children = childStates.map {
          case (id, state) =>
            Registry.Record(
              id = id,
              name = id,
              aspects = Map(
                "dcat-distribution-strings" -> JsObject("title" -> JsString(id))
              ) ++ state.map(
                value => "publishing" -> JsObject("state" -> JsString(value))
              ),
              tenantId = Some(BigInt(0))
            )
        }
        val record = Registry.Record(
          id = "parent-dataset",
          name = "parent dataset",
          aspects = Map(
            "dcat-dataset-strings" -> JsObject(
              "title" -> JsString("parent dataset")
            ),
            "publishing" -> JsObject("state" -> JsString(parentState)),
            "dataset-distributions" -> JsObject(
              "distributions" -> JsArray(
                children.map(Registry.recordFormat.write).toVector
              )
            )
          ),
          tenantId = Some(BigInt(0))
        )

        val dataset = Conversions.convertRegistryDataSet(record)(ZoneOffset.UTC)
        dataset.publishingState shouldBe Some(parentState)
        dataset.distributions
          .map(
            distribution =>
              distribution.identifier.get -> distribution.publishingState
          )
          .toMap shouldBe childStates.toMap
      }
    }
  }

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
