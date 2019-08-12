package au.csiro.data61.magda.api

import au.csiro.data61.magda.test.util.Generators
import org.scalatest.{BeforeAndAfterAll, FunSpecLike}
import akka.http.scaladsl.server.Route

import scala.concurrent.duration._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.ContentTypes.`application/json`
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, MAGDA_TENANT_ID_HEADER}
import au.csiro.data61.magda.model.RegistryConverters
import au.csiro.data61.magda.model.misc.{DataSet, DataSetAccessNotes}
import au.csiro.data61.magda.api.model.AutoCompleteQueryResult
import org.scalacheck.Gen

import scala.collection.mutable

class AutoCompleteApiSpecApiSpec
  extends FunSpecLike
    with BaseSearchApiSpec
    with RegistryConverters
    with BeforeAndAfterAll {

  override def afterAll {
    super.afterAll
    cleanUpIndexes()
  }

  def createDatasetWithItems(items: Seq[String]) = {
    val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty
    val dataSets = Gen.listOfN(items.size, Generators.dataSetGen(inputCache)).retryUntil(_ => true).sample.get.zip(items).map{
      case (dataset, notes) =>
        dataset.copy(
          accessNotes = Some(DataSetAccessNotes(Some(notes)))
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
    "Access database name `ABC` and table `bde`"
  )

  it("sdsdsdds") {
    val routes = createDatasetWithItems(notes)
    Get(s"/v0/autoComplete?type=accessNotes.notes") ~> addSingleTenantIdHeader ~> routes ~> check {
      status shouldBe OK
      contentType shouldBe `application/json`
      //val response = responseAs[AutoCompleteQueryResult]
    }
  }


}
