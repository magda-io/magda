package au.csiro.data61.magda.api

import au.csiro.data61.magda.test.util.Generators
import org.scalatest.{BeforeAndAfterAll}

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.{OK, InternalServerError}
import au.csiro.data61.magda.model.RegistryConverters
import au.csiro.data61.magda.model.misc.{DataSetAccessNotes}
import au.csiro.data61.magda.api.model.AutoCompleteQueryResult
import org.scalacheck.Gen

import scala.collection.mutable

class AutoCompleteApiSpec
    extends BaseSearchApiSpec
    with RegistryConverters
    with BeforeAndAfterAll {

  override def afterAll {
    super.afterAll
    cleanUpIndexes()
  }

  def createDatasetWithItems(items: Seq[String]) = {
    val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty
    val dataSets = Gen
      .listOfN(items.size, Generators.dataSetGen(inputCache))
      .retryUntil(_ => true)
      .sample
      .get
      .zip(items)
      .map {
        case (dataset, location) =>
          dataset.copy(
            accessNotes = Some(DataSetAccessNotes(
              location = Some(location)
            ))
          )
      }
    putDataSetsInIndex(dataSets) match {
      case (_, _, routes) => routes
    }
  }

  val notes = List(
    "/shareDriveA/c/d/e",
    "/shareDriveB/c/f/h",
    "/shareDriveB/c/a/h",
    "Contact test@email.com for access",
    "Contact test2@email.com for access",
    "Access database name `ABC` and table `bde`",
    "/shareDriveC/d/e/f",
    "/shareDriveC/d/e/f",
    "/shareDriveC/e/f/d"
  )

  val routes = createDatasetWithItems(notes)

  it("Should response empty list without error if input is not supplied") {

    Get(s"/v0/autoComplete?field=accessNotes.location") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual (0)
      response.errorMessage shouldBe None
    }
  }

  it("Should response first 3 items + last 2 item with input /shareDrive") {

    Get(s"/v0/autoComplete?field=accessNotes.location&input=/shareDrive") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual (5) // --- no duplication will be included
      response.suggestions.contains(notes(0)) shouldBe true
      response.suggestions.contains(notes(1)) shouldBe true
      response.suggestions.contains(notes(2)) shouldBe true
      response.suggestions.contains(notes(7)) shouldBe true
      response.suggestions.contains(notes(8)) shouldBe true
    }
  }

  it("Should response Item 2 & 3 with input /shareDriveB") {

    Get(s"/v0/autoComplete?field=accessNotes.location&input=/shareDriveB") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual (2)
      response.suggestions.contains(notes(1)) shouldBe true
      response.suggestions.contains(notes(2)) shouldBe true
    }
  }

  it("Should response Item 2 & 3 with input /shareDriveb (Lowercase b)") {

    Get(s"/v0/autoComplete?field=accessNotes.location&input=/shareDriveB") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual (2)
      response.suggestions.contains(notes(1)) shouldBe true
      response.suggestions.contains(notes(2)) shouldBe true
    }
  }

  it("Should response Item 4 & 5 with input `contact test`") {

    Get(s"/v0/autoComplete?field=accessNotes.location&input=contact%20test") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual (2)
      response.suggestions.contains(notes(3)) shouldBe true
      response.suggestions.contains(notes(4)) shouldBe true
    }
  }

  it("Should response Error with invalid field name: xxxx") {

    Get(s"/v0/autoComplete?field=xxxx&input=xxxx") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe InternalServerError
    }
  }

  it("Should response `/shareDriveC/d/e/f` (without duplication) & `/shareDriveC/e/f/d` with input /shareDriveC") {

    Get(s"/v0/autoComplete?field=accessNotes.location&input=/shareDriveC") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      val response = responseAs[AutoCompleteQueryResult]
      response.suggestions.size shouldEqual(2) // --- should be no duplication. Thus, 2 rather than 3
      response.suggestions.contains(notes(6)) shouldBe true
      response.suggestions.contains(notes(8)) shouldBe true
    }
  }

}
