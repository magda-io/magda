package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.headers.RawHeader
import au.csiro.data61.magda.Authentication
import org.scalatest.Ignore

@Ignore
class TestRecordEsriPolicyWithGroupsAndOwner
    extends RecordOpaPolicyWithEsirGroupsOrMagdaOrgUnitsOnlySpec {
  override def testConfigSource: String =
    s"""
       |opa.recordPolicyId="object.registry.record.esri_owner_groups"
    """.stripMargin

  override def beforeAll(): Unit = {
    super.beforeAll()
    testRecords = getTestRecords(
      dataPath + "add-esri-access-control-aspect-groups-and-owner.json"
    )
  }

  override def addJwtToken(userId: String): RawHeader = {
    if (userId.equals(adminUser) || userId.equals(anonymous)) {
      super.addJwtToken(userId)

    } else {

      /**
        * The current Java JWT library is not capable of creating custom claims that are json objects.
        * The typescript library comes to help. These jwt tokens are created by magda-typescript-common/src/test/session/buildJwtForRegistryEsriGroupsAndOwnerOpaTest.ts.
        *
        * Follow the steps below to create them.
        *
        *     cd magda-typescript-common
        *     yarn build
        *     yarn create_esri_groups_owner_jwt
        *
        * The jwt will claim session.esriGroups and session.esriUser.
        */
      val jwtToken =
        if (userId.equals("00000000-0000-1000-0000-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJEZXAuIEEiLCJCcmFuY2ggQSwgRGVwLiBBIiwiQnJhbmNoIEIsIERlcC4gQSIsIlNlY3Rpb24gQywgQnJhbmNoIEIsIERlcC4gQSJdLCJlc3JpVXNlciI6InVzZXIwIn19LCJpYXQiOjE1NzA3NTE4MDd9.6OCdIsvochOosNVYVHcTkJo7zHg_JpHHbusVansoatw"
        else if (userId.equals("00000000-0000-1000-0001-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMS0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJCcmFuY2ggQSwgRGVwLiBBIl0sImVzcmlVc2VyIjoidXNlcjEifX0sImlhdCI6MTU3MDc1MTgwN30.3ElBELW8hCF0tD1fxFX2ecuBNyGNYyatUr7UpEfLJ3k"
        else if (userId.equals("00000000-0000-1000-0002-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMi0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJCcmFuY2ggQiwgRGVwLiBBIiwiU2VjdGlvbiBDLCBCcmFuY2ggQiwgRGVwLiBBIl0sImVzcmlVc2VyIjoidXNlcjIifX0sImlhdCI6MTU3MDc1MTgwN30.T2Gkc8K5r2qet7z7LOUIot7DTWsFctc0p7AOT3mZrtI"
        else if (userId.equals("00000000-0000-1000-0003-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMy0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJTZWN0aW9uIEMsIEJyYW5jaCBCLCBEZXAuIEEiXSwiZXNyaVVzZXIiOiJ1c2VyMyJ9fSwiaWF0IjoxNTcwNzUxODA3fQ.PVWtGVy3s6iTQHL9ax1MnHAOU1K4jaiUyOJrigdUqkM"
        else
          ""
      RawHeader(
        Authentication.headerName,
        jwtToken
      )
    }

  }

}
