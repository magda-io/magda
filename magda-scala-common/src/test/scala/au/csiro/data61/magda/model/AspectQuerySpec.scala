package au.csiro.data61.magda.model

import akka.actor.ActorSystem
import org.scalatest.{FunSpec, Matchers}

import scala.io.BufferedSource
import scala.io.Source.fromFile
import spray.json._

import java.io.File
import au.csiro.data61.magda.model.Registry

import scala.util.{Failure, Success, Try}
import java.time.ZoneOffset

class AspectQuerySpec extends FunSpec with Matchers {

  implicit val system = ActorSystem()
  val logger = akka.event.Logging.getLogger(system, getClass)

  describe("AspectQueryTrue") {
    it("should produce correct sql query") {
      val aq = AspectQueryTrue()
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value shouldBe "TRUE"
    }

    it("should produce correct sql query when negated = true") {
      val aq = AspectQueryTrue(negated = true)
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value shouldBe "FALSE"
    }
  }

  describe("AspectQueryExists") {
    it("should produce correct sql query") {
      val aq = AspectQueryExists("testAspect", List("fieldA", "fieldB"))
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.trim shouldBe """ exists (
                                    |           SELECT 1 FROM recordaspects
                                    |           WHERE (aspectId, recordid, tenantId)=(?, "Records"."recordId", "Records"."tenantId") AND (
                                    |           (data #> string_to_array(?, ',')) IS NOT NULL
                                    |        ))""".stripMargin.trim
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB")
    }

    it("should produce correct sql query when negated = true") {
      val aq = AspectQueryExists("testAspect", List("fieldA", "fieldB"), true)
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.trim shouldBe """not exists (
                                    |           SELECT 1 FROM recordaspects
                                    |           WHERE (aspectId, recordid, tenantId)=(?, "Records"."recordId", "Records"."tenantId") AND (
                                    |           (data #> string_to_array(?, ',')) IS NOT NULL
                                    |        ))""".stripMargin.trim
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB")
    }

  }

  // describe("Test all sample error dataset JSON data without exception thrown") {

  //   val path = getClass.getResource("/sampleErrorDatasetJson")
  //   val folder = new File(path.getPath)
  //   if (folder.exists && folder.isDirectory)
  //     folder.listFiles.toList
  //       .foreach[Any](
  //         file =>
  //           it(
  //             s"should convert JSON file: ${file.getName} without exception thrown"
  //           ) {
  //             val jsonResSource: BufferedSource = fromFile(file)
  //             val jsonRes: String =
  //               try {
  //                 jsonResSource.mkString
  //               } finally {
  //                 jsonResSource.close()
  //               }
  //             val dataset = jsonRes.parseJson.convertTo(Registry.recordFormat)
  //             Try(
  //               Conversions.convertRegistryDataSet(
  //                 dataset,
  //                 Some(logger)
  //               )(ZoneOffset.UTC)
  //             ) match {
  //               case Failure(e) =>
  //                 fail(s"Failed to parse dataset and throw an exception ${e}")
  //               case _ =>
  //             }
  //           }
  //       )
  // }

  // describe("Test all sample NO error dataset JSON data") {

  //   val path = getClass.getResource("/sampleNoErrorDatasetJson")
  //   val folder = new File(path.getPath)
  //   if (folder.exists && folder.isDirectory)
  //     folder.listFiles.toList
  //       .foreach[Any](
  //         file =>
  //           it(
  //             s"should convert JSON file: ${file.getName} without exception thrown"
  //           ) {
  //             val jsonResSource: BufferedSource = fromFile(file)
  //             val jsonRes: String =
  //               try {
  //                 jsonResSource.mkString
  //               } finally {
  //                 jsonResSource.close()
  //               }
  //             val dataset = jsonRes.parseJson.convertTo(Registry.recordFormat)
  //             Try(
  //               Conversions.convertRegistryDataSet(
  //                 dataset,
  //                 None
  //               )(ZoneOffset.UTC)
  //             ) match {
  //               case Failure(e) =>
  //                 fail(s"Failed to parse dataset and throw an exception ${e}")
  //               case Success(v) =>
  //                 v
  //             }
  //           }
  //       )
  // }
}
