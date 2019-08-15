package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.StatusCodes
import au.csiro.data61.magda.model.Registry.Record
import au.csiro.data61.magda.registry.{Full, RecordsPage}

class RecordsOpaSpec extends ApiWithOpaSpec {

  it("should work") { param =>
    Get(s"/v0/records?aspect=organization") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId0) ~>  param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val records = responseAs[RecordsPage[Record]].records
      records.length shouldBe 5
      records.head.id shouldBe "record-1"
      records(1).id shouldBe "record-2"
      records(2).id shouldBe "record-3"
      records(3).id shouldBe "record-4"
      records(4).id shouldBe "record-5"
    }

    Get(s"/v0/records?aspect=organization") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId1) ~>  param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val records = responseAs[RecordsPage[Record]].records
      records.foreach(record =>
        println(record)
      )

      records.length shouldBe 2
      records.head.id shouldBe "record-2"
      records(1).id shouldBe "record-5"
    }

    Get(s"/v0/records?aspect=organization") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId2) ~>  param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val records = responseAs[RecordsPage[Record]].records
      records.foreach(record =>
        println(record)
      )

      records.length shouldBe 3
      records.head.id shouldBe "record-3"
      records(1).id shouldBe "record-4"
      records(2).id shouldBe "record-5"
    }

    Get(s"/v0/records?aspect=organization") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(userId3) ~>  param.api(Full).routes ~> check {
      status shouldBe StatusCodes.OK
      val records = responseAs[RecordsPage[Record]].records
      records.foreach(record =>
        println(record)
      )

      records.length shouldBe 2
      records.head.id shouldBe "record-4"
      records(1).id shouldBe "record-5"
    }
  }

}
