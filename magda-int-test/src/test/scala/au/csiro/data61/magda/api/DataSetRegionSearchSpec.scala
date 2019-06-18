package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.Registry.MAGDA_ADMIN_PORTAL_ID
import au.csiro.data61.magda.model.misc._

class DataSetRegionSearchSpec extends DataSetSearchSpecBase {

  it("for a region in query text should boost results from that region") {
    // 3 fake datasets. One that relates to Queensland, the other to all of Australia
    // (but one of those has `queensland` in title otherwise only one document will be matched)
    // The Australian one happens to be slightly more "relevant" due to the description, but the
    //  Queensland dataset should be boosted if a user searches for wildlife density in Queensland

    val qldGeometry = Location.fromBoundingBox(Seq(BoundingBox(-20.0, 147.0, -25.0, 139.0)))

    val qldDataset = DataSet(
        identifier="ds-region-in-query-test-1",
        tenantId=MAGDA_ADMIN_PORTAL_ID,
        title=Some("Wildlife density in rural areas"),
        description=Some("Wildlife density as measured by the state survey"),
        catalog=Some("region-in-query-test-catalog"),
        spatial=Some(Location(geoJson=qldGeometry)),
        quality = 0.6,
        score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in queensland."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, qldDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual qldDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+queensland&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual qldDataset.identifier // Failed
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+queensland&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

    } finally {
      this.deleteIndex(indexName)
    }
  }

  it("for a region in query text should boost results from that region by acronym") {
    val saGeometry = Location.fromBoundingBox(Seq(BoundingBox(-27, 134, -30, 130)))

    val saDataset = DataSet(
      identifier="ds-region-in-query-test-1",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density as measured by the state survey"),
      catalog=Some("region-in-query-test-catalog"),
      spatial=Some(Location(geoJson=saGeometry)),
      quality = 0.6,
      score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)
    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas south"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in SA."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, saDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual saDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density+in+SA&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual saDataset.identifier // Failed
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+SA&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      // Verify that half the name doesn't boost results
      Get(s"""/v0/datasets?query=wildlife+density+south&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual saDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density+south&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

    } finally {
      this.deleteIndex(indexName)
    }
  }

  it("for a region in query text should boost results from that region in Alfredton") {
    // 3 fake datasets. One that relates to Alfredton, the other to all of Australia
    // (but one of those has `Alfredton` in title otherwise only one document will be matched)
    // The Austrlian one happens to be slightly more "relevant" due to the description, but the
    //  Alfredton dataset should be boosted if a user searches for wildlife density in Alfredton

    val alfGeometry = Location.fromBoundingBox(Seq(BoundingBox(-37.555, 143.81, -37.56, 143.80)))

    val alfDataset = DataSet(
      identifier="ds-region-in-query-test-1",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density as measured by the state survey"),
      catalog=Some("region-in-query-test-catalog"),
      spatial=Some(Location(geoJson=alfGeometry)),
      quality = 0.6,
      score = None)
    val nationalDataset1 = DataSet(
      identifier="ds-region-in-query-test-2",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)
    val nationalDataset2 = DataSet(
      identifier="ds-region-in-query-test-3",
      tenantId=MAGDA_ADMIN_PORTAL_ID,
      title=Some("Wildlife density in rural areas"),
      description=Some("Wildlife density aggregated from states' measures of wildlife density in Alfredton."),
      catalog=Some("region-in-query-test-catalog"),
      quality = 0.6,
      score = None)

    val datasets = List(nationalDataset1, nationalDataset2, alfDataset)

    val (indexName, _, routes) = putDataSetsInIndex(datasets)

    try {
      blockUntilExactCount(3, indexName)

      // Verify that national dataset is usually more relevant
      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 3
        response.dataSets.head.identifier shouldEqual nationalDataset1.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
        response.dataSets(2).identifier shouldEqual alfDataset.identifier

      }

      Get(s"""/v0/datasets?query=wildlife+density&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+Alfredton&limit=${datasets.size}""") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 2
        response.dataSets.head.identifier shouldEqual alfDataset.identifier
        response.dataSets(1).identifier shouldEqual nationalDataset2.identifier
      }

      Get(s"""/v0/datasets?query=wildlife+density+in+Alfredton&limit=${datasets.size}""") ~> addTenantIdHeader(tenant1) ~> routes ~> check {
        status shouldBe OK
        val response = responseAs[SearchResult]
        response.dataSets.size shouldEqual 0
      }
    } finally {
      this.deleteIndex(indexName)
    }
  }

}
