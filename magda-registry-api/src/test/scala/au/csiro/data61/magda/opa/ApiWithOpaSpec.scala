package au.csiro.data61.magda.opa

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
import org.scalatest.{Matchers, fixture}
import scalikejdbc.{GlobalSettings, LoggingSQLAndTimeSettings}
import scalikejdbc._
import spray.json.{JsObject, JsonParser}

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
    if (userId.equals("anonymous"))
      return RawHeader("", "")

    val theRecordPolicyId = recordPolicyId

    if (theRecordPolicyId.endsWith("esri_groups")) {
      val jwtToken =
        JWT
          .create()
          .withClaim("userId", userId)
          .withArrayClaim("groups", esriUserGroupMap(userId))
          .sign(Authentication.algorithm)
      //      println(s"userId: $userId")
      //      println(s"jwtToken: $jwtToken")
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
    *     Relationship among users, organizations and records.
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
  val userId0 = "00000000-0000-1000-0000-000000000000" // admin user
  val userId1 = "00000000-0000-1000-0001-000000000000"
  val userId2 = "00000000-0000-1000-0002-000000000000"
  val userId3 = "00000000-0000-1000-0003-000000000000"
  val anonymous = "anonymous"

  val esriUserGroupMap: Map[String, Array[String]] = Map(
    userId0 -> Array(
      "Dep. A",
      "Branch A, Dep. A",
      "Branch B, Dep. A",
      "Section C, Branch B, Dep. A"
    ),
    userId1 -> Array("Branch A, Dep. A"),
    userId2 -> Array("Branch B, Dep. A", "Section C, Branch B, Dep. A"),
    userId3 -> Array("Section C, Branch B, Dep. A")
  )

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
        userId0,
        ""
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/aspects", aspectDef) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId0,
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
    val recordsSource: BufferedSource = fromFile(file)

    val recordsJsonStr: String = try {
      recordsSource.mkString
    } finally {
      recordsSource.close()
    }

    JsonParser(recordsJsonStr).convertTo[List[Record]]
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
        userId0,
        ""
      ) ~> param.api(Full).routes ~> check {
        if (status == StatusCodes.NotFound) {
          Post(s"/v0/records", record) ~> addTenantIdHeader(TENANT_0) ~> addJwtToken(
            userId0,
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
