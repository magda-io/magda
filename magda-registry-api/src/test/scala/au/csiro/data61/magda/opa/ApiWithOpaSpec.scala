package au.csiro.data61.magda.opa

import akka.pattern.gracefulStop
import akka.actor.{ActorRef, ActorSystem}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.model.headers.RawHeader
import akka.http.scaladsl.testkit.{RouteTestTimeout, ScalatestRouteTest}
import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.model.Auth.AuthProtocols
import au.csiro.data61.magda.model.Registry.{
  AspectDefinition,
  MAGDA_TENANT_ID_HEADER,
  Record
}
import au.csiro.data61.magda.registry._
import com.auth0.jwt.JWT
import com.typesafe.config.Config
import org.scalamock.scalatest.MockFactory
import org.scalatest.{Matchers, Outcome, fixture}
import scalikejdbc.{GlobalSettings, LoggingSQLAndTimeSettings}
import scalikejdbc._
import scalikejdbc.config.{DBs, EnvPrefix, TypesafeConfig, TypesafeConfigReader}
import spray.json.{JsObject, JsString, JsonParser}

import scala.concurrent.Await
import scala.concurrent.duration._
import scala.io.BufferedSource
import scala.io.Source.fromFile

abstract class ApiWithOpaSpec
    extends fixture.FunSpec
    with ScalatestRouteTest
    with Matchers
    with Protocols
    with SprayJsonSupport
    with MockFactory
    with AuthProtocols {
  implicit def default(implicit system: ActorSystem): RouteTestTimeout =
    RouteTestTimeout(300 seconds)
  override def beforeAll(): Unit = {
    super.beforeAll()
  }

  override def withFixture(test: OneArgTest): Outcome = {
    case class DBsWithEnvSpecificConfig(configToUse: Config)
        extends DBs
        with TypesafeConfigReader
        with TypesafeConfig
        with EnvPrefix {

      override val config: Config = configToUse
    }

    DBsWithEnvSpecificConfig(testConfig).setupAll()

    val actor = system.actorOf(
      WebHookActor.props("http://localhost:6101/v0/")(testConfig)
    )
    val authClient =
      new AuthApiClient()(testConfig, system, executor, materializer)
    val api = (role: Role) =>
      new Api(
        if (role == Full) Some(actor) else None,
        authClient,
        testConfig,
        system,
        executor,
        materializer
      )

    try {
      super.withFixture(
        test.toNoArgTest(FixtureParam(api, actor, authClient, testConfig))
      )
    } finally {
      //      Await.result(system.terminate(), 30 seconds)
      Await.result(gracefulStop(actor, 30 seconds), 30 seconds)
    }
  }

  case class FixtureParam(
      api: Role => Api,
      webHookActor: ActorRef,
      authClient: AuthApiClient,
      config: Config
  )

  def addTenantIdHeader(tenantId: BigInt): RawHeader = {
    RawHeader(MAGDA_TENANT_ID_HEADER, tenantId.toString)
  }

  def addJwtToken(userId: String, recordPolicyId: String): RawHeader = {
    if (userId.equals(anonymous))
      return RawHeader("", "")

    val theRecordPolicyId = recordPolicyId

    if (theRecordPolicyId.endsWith("esri_owner_groups")) {
      /**
        * The current Java JWT library is not capable of creating custom claims that are json objects.
        * The typescript library comes to help. These jwt tokens are created by magda-typescript-common/src/test/session/buildJwtForRegistryEsriOpaTest.ts.
        *
        * Follow the steps below to create them.
        *
        *     cd magda-typescript-common
        *     yarn build
        *     yarn create_esri_jwt
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
    } else {
      val jwtToken =
        JWT
          .create()
          .withClaim("userId", userId)
          .sign(Authentication.algorithm)
      //      println(s"userId: $userId")
      //      println(s"jwtToken: $jwtToken")
      RawHeader(
        Authentication.headerName,
        jwtToken
      )
    }

  }

  val TENANT_0: BigInt = 0

  /**
    *                          Relationship among users, organizations and records
    *
    *   (1) If using the hierarchical organization based policy, a user's access privilege is based on the user's
    *       ID and orgUnitId.
    *
    *   (2) If using esri groups-based policy, a user's access privilege is based on the user's ID and groups.
    *       The testing users are assigned to some groups in such a way that their access privileges will be the
    *       same as in case (1).
    *
    *
    *
    *                +----------+
    *                |  Dep. A  |
    *                | userId0  |
    *                | record-0 |
    *                +----+-----+
    *                     |
    *            +--------+---------+
    *            |                  |
    *       +----+-----+       +----+-----+
    *       | Branch A |       | Branch B |
    *       | userId1  |  ref  | userId2  |
    *   +-->| record-1 | <-----| record-2 |      ref
    *   |   |          | <-----| record-5 |----------------+
    *   |   +----------+       +----+-----+                |
    *   |                           |                      |
    *   |              +-------------------------+         |
    *   |              |            |            |         |
    *   |         +----+----+  +----+----+  +----+-----+   |     +----------+
    *   |         |Section A|  |Section B|  |Section C |   |     | (Public) |
    *   |         |         |  |         |  | userId3  |   |     |          |
    *   |         |         |  +---------+  |          | <-+     |          |  (Section C owns record-4 but does
    *   |         +---------+   [empty] <---| record-3 | <-------| record-4 |   not put access restriction on it.)
    *   |                               ref +----------+     ref +----------+
    *   |                                                              | ref
    *   +--------------------------------------------------------------+
    *
    */
  val adminUser = "00000000-0000-1000-9999-000000000000"
  val userId0 = "00000000-0000-1000-0000-000000000000"
  val userId1 = "00000000-0000-1000-0001-000000000000"
  val userId2 = "00000000-0000-1000-0002-000000000000"
  val userId3 = "00000000-0000-1000-0003-000000000000"
  val anonymous = "anonymous"

  val userIdsAndExpectedRecordIdIndexesWithoutLink = List(
    (userId0, List(0, 1, 2, 3, 4, 5)),
    (userId1, List(1, 4)),
    (userId2, List(2, 3, 4, 5)),
    (userId3, List(3, 4)),
    (anonymous, List(4))
  )

  val userIdsAndExpectedRecordIdIndexesWithSingleLink = List(
    (userId0, List(2)),
    (userId1, List()),
    (userId2, List(2)),
    (userId3, List()),
    (anonymous, List())
  )

  val singleLinkRecordIdMap: Map[String, String] = Map("record-2" -> "record-1")

  val recordOrgNames = List(
    "Dep. A",
    "Branch A, Dep. A",
    "Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Section C, Branch B, Dep. A",
    "Branch B, Dep. A"
  )

  val accessControlId = "dataset-access-control"
  val esriAccessControlId = "esri-access-control"
  val organizationId = "organization"
  val withLinkId = "withLink"
  val linkName = "someLink"
  val withLinksId = "withLinks"
  val linksName = "someLinks"

  val dataPath =
    "magda-registry-api/src/test/resources/data/"

  var hasAspectDefinitions = false

  def createAspectDefinitions(
      param: FixtureParam
  ): AnyVal = {
    if (hasAspectDefinitions)
      return

    val accessControlSchemaSource: BufferedSource = fromFile(
      "magda-registry-aspects/dataset-access-control.schema.json"
    )

    val esriAccessControlSchemaSource: BufferedSource = fromFile(
      "magda-registry-aspects/esri-access-control.schema.json"
    )

    val orgAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "organization-schema.json"
    )

    val withLinkAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "with-link-schema.json"
    )

    val withLinksAspectSchemaSource: BufferedSource = fromFile(
      dataPath + "with-links-schema.json"
    )

    val accessControlSchema: String =
      try {
        accessControlSchemaSource.mkString
      } finally {
        accessControlSchemaSource.close()
      }

    val esriAccessControlSchema: String =
      try {
        esriAccessControlSchemaSource.mkString
      } finally {
        esriAccessControlSchemaSource.close()
      }

    val orgAspectSchema: String =
      try {
        orgAspectSchemaSource.mkString
      } finally {
        orgAspectSchemaSource.close()
      }

    val withLinkAspectSchema: String =
      try {
        withLinkAspectSchemaSource.mkString
      } finally {
        withLinkAspectSchemaSource.close()
      }

    val withLinksAspectSchema: String =
      try {
        withLinksAspectSchemaSource.mkString
      } finally {
        withLinksAspectSchemaSource.close()
      }

    val accessControlDef = AspectDefinition(
      accessControlId,
      "access control aspect",
      Some(JsonParser(accessControlSchema).asJsObject)
    )

    val esriAccessControlDef = AspectDefinition(
      esriAccessControlId,
      "access control aspect",
      Some(JsonParser(esriAccessControlSchema).asJsObject)
    )

    val orgAspectDef = AspectDefinition(
      organizationId,
      "organization aspect",
      Some(JsonParser(orgAspectSchema).asJsObject)
    )

    val withLinkAspectDef = AspectDefinition(
      withLinkId,
      "with link aspect",
      Some(JsonParser(withLinkAspectSchema).asJsObject)
    )

    val withLinksAspectDef = AspectDefinition(
      withLinksId,
      "with links aspect",
      Some(JsonParser(withLinksAspectSchema).asJsObject)
    )

    val aspectDefs = List(
      accessControlDef,
      esriAccessControlDef,
      orgAspectDef,
      withLinkAspectDef,
      withLinksAspectDef
    )

    aspectDefs.map(aspectDef => {
      Get(s"/v0/aspects/${aspectDef.id}") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        adminUser,
        ""
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/aspects", aspectDef) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            adminUser,
            ""
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
          }
        }
      }
    })

    hasAspectDefinitions = true
  }

  def getTestRecords(file: String): List[Record] = {
    val baseFile = dataPath + "records.json"
    val baseRecordsSource = fromFile(baseFile)
    val recordsAccessControlAspectSource = fromFile(file)

    val baseRecordsJsonStr = try {
      baseRecordsSource.mkString
    } finally {
      baseRecordsSource.close()
    }

    val baseRecords = JsonParser(baseRecordsJsonStr).convertTo[List[Record]]

    val recordsAccessControlAspectJsonStr = try {
      recordsAccessControlAspectSource.mkString
    } finally {
      recordsAccessControlAspectSource.close()
    }

    val accessControlAspects = JsonParser(recordsAccessControlAspectJsonStr)
      .convertTo[List[JsObject]]

    val recordAccessControlAspectMap = accessControlAspects
      .map(each => {
        each.fields("id") -> each.fields("aspects").asJsObject
      })
      .toMap

    baseRecords.map(record => {
      val accessControlAspect =
        recordAccessControlAspectMap.get(JsString(record.id))
      if (accessControlAspect.nonEmpty) {
        val key = accessControlAspect.get.fields.keys.toList.head
        val keys = record.aspects.keys.toList
        val theAspectList = keys
          .map(k => k -> record.aspects(k)) :+ key -> accessControlAspect.get
          .fields(key)
          .asJsObject

        record.copy(aspects = theAspectList.toMap)
      } else {
        record
      }
    })
  }

  var testRecords: List[Record] = Nil

  var hasRecords = false

  def createRecords(param: FixtureParam): AnyVal = {
    if (hasRecords)
      return

    DB localTx { implicit session =>
      sql"Delete from public.recordaspects".update
        .apply()
      sql"Delete from public.records".update
        .apply()
    }

    testRecords.map(record => {
      Get(s"/v0/records/${record.id}") ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
        adminUser,
        ""
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/records", record) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            adminUser,
            ""
          ) ~> param.api(Full).routes ~> check {
            status shouldBe StatusCodes.OK
          }
        }
      }
    })

    hasRecords = true
  }

  lazy val singleLinkRecordIdMapDereferenceIsFalse
      : Map[(String, String), String] =
    Map((userId0, "record-2") -> "record-1", (userId2, "record-2") -> "")

  lazy val singleLinkRecordIdMapDereferenceIsTrue
      : Map[(String, String), JsObject] =
    Map(
      (userId0, "record-2") -> testRecords(1).toJson.asJsObject,
      (userId2, "record-2") -> JsObject.empty
    )

  GlobalSettings.loggingSQLAndTime = LoggingSQLAndTimeSettings(
    enabled = false,
    singleLineMode = true,
    logLevel = 'debug
  )

}
