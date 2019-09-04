package au.csiro.data61.magda.opa

import akka.pattern.gracefulStop
import au.csiro.data61.magda.client.AuthApiClient
import au.csiro.data61.magda.registry.{Api, Full, Role, WebHookActor}
import com.typesafe.config.Config
import org.scalatest.{Ignore, Outcome}
import scalikejdbc.config.{DBs, EnvPrefix, TypesafeConfig, TypesafeConfigReader}
import scalikejdbc.{GlobalSettings, LoggingSQLAndTimeSettings}

import scala.concurrent.Await
import scala.concurrent.duration._

@Ignore
class RecordsWithOwnerOrgUnitsOpaPoliciesSpec extends RecordsOpaSpec {
  override def testConfigSource =
    s"""
       |opa.basePolicyId="object.registry.record.owner_orgunit"
    """.stripMargin

  override def beforeAll() = {
    super.beforeAll()
    testRecords = getTestRecords(dataPath + "records.json")
  }

  override def withFixture(test: OneArgTest): Outcome = {

    GlobalSettings.loggingSQLAndTime = LoggingSQLAndTimeSettings(
      enabled = false,
      singleLineMode = true,
      logLevel = 'debug
    )

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

}
