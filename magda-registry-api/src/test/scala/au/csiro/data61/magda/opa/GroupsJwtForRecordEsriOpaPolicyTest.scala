package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.headers.RawHeader
import _root_.au.csiro.data61.magda.Authentication

trait GroupsJwtForRecordEsriOpaPolicyTest extends ApiWithOpa {

  override def testConfigSource: String =
    s"""
       |opa.recordPolicyId="object.registry.record.esri_owner_groups"
    """.stripMargin

  override def addJwtToken(userId: String): RawHeader = {
    if (userId.equals(adminUser) || userId.equals(anonymous)) {
      super.addJwtToken(userId)

    } else {

      /**
        * The current Java JWT library is not capable of creating custom claims that are json objects.
        * The typescript library comes to help. These jwt tokens are created by magda-typescript-common/src/test/session/buildJwtForRegistryEsriOpaGroupsTest.ts.
        *
        * Follow the steps below to create them.
        *
        *     cd magda-typescript-common
        *     yarn build
        *     yarn create_esri_groups_jwt
        *
        * The jwt will claim session.esriGroups.
        */
      val jwtToken =
        if (userId.equals("00000000-0000-1000-0000-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJEZXAuIEEiLCJCcmFuY2ggQSwgRGVwLiBBIiwiQnJhbmNoIEIsIERlcC4gQSIsIlNlY3Rpb24gQywgQnJhbmNoIEIsIERlcC4gQSJdfX0sImlhdCI6MTU2ODI4ODgzNn0.V8VzOqKKngc2Fykuy7C_oBjvJRhJeosLnN8a066ffuo"
        else if (userId.equals("00000000-0000-1000-0001-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMS0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJCcmFuY2ggQSwgRGVwLiBBIl19fSwiaWF0IjoxNTY4Mjg4ODM2fQ.Vnr3KSmJI6A5CnkB9o7E_cHnz_FcU1RkS5HLQe5imnc"
        else if (userId.equals("00000000-0000-1000-0002-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMi0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJCcmFuY2ggQiwgRGVwLiBBIiwiU2VjdGlvbiBDLCBCcmFuY2ggQiwgRGVwLiBBIl19fSwiaWF0IjoxNTY4Mjg4ODM2fQ.YOXKLCWuJJDuz43SNcLBRLYdnxmKNQsdm_DymPu4n14"
        else if (userId.equals("00000000-0000-1000-0003-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMy0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaUdyb3VwcyI6WyJTZWN0aW9uIEMsIEJyYW5jaCBCLCBEZXAuIEEiXX19LCJpYXQiOjE1NjgyODg4MzZ9.5gLU6Tz_Q74r0NeyvrjlSsRe63eRR8NwZyCsPFIAEzg"
        else
          ""
      RawHeader(
        Authentication.headerName,
        jwtToken
      )
    }

  }
}
