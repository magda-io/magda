package au.csiro.data61.magda.opa

import akka.http.scaladsl.model.headers.RawHeader
import _root_.au.csiro.data61.magda.Authentication
import org.scalatest.Ignore

@Ignore
class TestRecordEsriOpaPolicyWithOwnerOnly
    extends RecordOpaPolicyWithOwnerOnlySpec {
  override def testConfigSource: String =
    s"""
       |opa.recordPolicyId="object.registry.record.esri_owner_groups"
    """.stripMargin

  override def beforeAll(): Unit = {
    super.beforeAll()
    testRecords = getTestRecords(
      dataPath + "add-esri-access-control-aspect-owner-only.json"
    )
  }

  override def addJwtToken(userId: String): RawHeader = {
    if (userId.equals(adminUser) || userId.equals(anonymous)) {
      super.addJwtToken(userId)

    } else {

      /**
        * The current Java JWT library is not capable of creating custom claims that are json objects.
        * The typescript library comes to help. These jwt tokens are created by magda-typescript-common/src/test/session/buildJwtForRegistryEsriOwnerOpaTest.ts.
        *
        * Follow the steps below to create them.
        *
        *     cd magda-typescript-common
        *     yarn build
        *     yarn create_esri_owner_jwt
        *
        * The jwt will claim session.esriUser.
        */
      val jwtToken =
        if (userId.equals("00000000-0000-1000-0000-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaVVzZXIiOiJ1c2VyMCJ9fSwiaWF0IjoxNTcwNjg3ODg4fQ.DmcpGvJLM4eZmtRHX0i0l9ypy1PqsBi_q993F4AcWNc"
        else if (userId.equals("00000000-0000-1000-0001-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMS0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaVVzZXIiOiJ1c2VyMSJ9fSwiaWF0IjoxNTcwNjg3ODg4fQ.MkC2-1ZUa9uxHnndUV-0WgVPKnEAyQ148rzZZvgODHo"
        else if (userId.equals("00000000-0000-1000-0002-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMi0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaVVzZXIiOiJ1c2VyMiJ9fSwiaWF0IjoxNTcwNjg3ODg4fQ.4G2ua0ycr6w8XK3EY8vpGQM0hJJE0ArVsBPOPtIVy2Y"
        else if (userId.equals("00000000-0000-1000-0003-000000000000"))
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMy0wMDAwMDAwMDAwMDAiLCJzZXNzaW9uIjp7InNlc3Npb24iOnsiZXNyaVVzZXIiOiJ1c2VyMyJ9fSwiaWF0IjoxNTcwNjg3ODg4fQ.Bdf7PWMjqdddou7NKEldtlSbi8YHv48H12O8Zjj62VM"
        else
          ""
      RawHeader(
        Authentication.headerName,
        jwtToken
      )
    }

  }

}
