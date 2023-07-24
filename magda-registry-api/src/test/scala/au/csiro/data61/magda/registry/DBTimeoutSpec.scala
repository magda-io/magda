package au.csiro.data61.magda.registry

import au.csiro.data61.magda.AppConfig
import com.typesafe.config.{Config, ConfigFactory}
import org.postgresql.util.PSQLException
import org.scalatest.{BeforeAndAfterEach, FunSpecLike, Matchers}
import scalikejdbc._

class DBTimeoutSpec extends FunSpecLike with Matchers with BeforeAndAfterEach {

  override def afterEach(): Unit = {
    ConnectionPool.closeAll()
  }

  private def setupEnv(testConfig: Config) = {
    DBsWithEnvSpecificConfig(testConfig).setupAll()

    DB localTx { implicit session =>
      sql"DROP SCHEMA IF EXISTS test CASCADE".update.apply()
      sql"CREATE SCHEMA test".update.apply()
    }
  }

  private def createConfig(
      globalTimeout: String = "15m",
      defaultTimeout: String = "90s"
  ) = ConfigFactory.parseString(s"""
        db-query.global-timeout = "${globalTimeout}"
        db-query.default-timeout = "${defaultTimeout}"
      """).resolve().withFallback(AppConfig.conf())

  private def getStatementTimeout() = {
    DB readOnly { implicit session =>
      sql"SELECT current_setting('statement_timeout') AS statement_timeout;"
        .map { rs =>
          rs.string(1)
        }
        .single()
        .apply()
    }
  }

  it("should timeout 2 seconds after `db-query.global-timeout` is set to 2s") {
    setupEnv(createConfig("2s", "90s"))
    getStatementTimeout() shouldBe Some("2s")
    DB localTx { implicit session =>
      withClue("should spend sleep at least 1s without timeout") {
        val before = System.nanoTime
        val res =
          sql"SELECT pg_sleep(1)"
            .map(rs => rs)
            .single
            .apply()
        val duration = (System.nanoTime - before) / 1e9d
        res.nonEmpty shouldEqual true
        duration should (be >= 1.0)
        duration should (be < 1.5)
      }
    }
    getStatementTimeout() shouldBe Some("2s")
    DB localTx { implicit session =>
      val before = System.nanoTime
      try {
        sql"SELECT pg_sleep(3)"
          .map(rs => rs)
          .single
          .apply()
        fail("should throw timeout exception but didn't")
      } catch {
        case e: PSQLException => e.toString should include("statement timeout")
      }
      val duration = (System.nanoTime - before) / 1e9d
      duration should (be >= 2.0)
      duration should (be < 2.5)
    }
  }

  it("should timeout 5 seconds after `db-query.global-timeout` is set to 5s") {
    setupEnv(createConfig("5s", "1s"))
    getStatementTimeout() shouldBe Some("5s")
    DB localTx { implicit session =>
      withClue("should spend sleep at least 3s without timeout") {
        val before = System.nanoTime
        val res =
          sql"SELECT pg_sleep(3)"
            .map(rs => rs)
            .single
            .apply()
        val duration = (System.nanoTime - before) / 1e9d
        res.nonEmpty shouldEqual true
        duration should (be >= 3.0)
        duration should (be < 3.5)
      }
    }
    getStatementTimeout() shouldBe Some("5s")
    DB localTx { implicit session =>
      val before = System.nanoTime
      try {
        sql"SELECT pg_sleep(5.5)"
          .map(rs => rs)
          .single
          .apply()
        fail("should throw timeout exception but didn't")
      } catch {
        case e: PSQLException => e.toString should include("statement timeout")
      }
      val duration = (System.nanoTime - before) / 1e9d
      duration should (be >= 5.0)
      duration should (be < 5.5)
    }
  }

  it(
    "should timeout after 1 seconds when `db-query.global-timeout` is set to 5s and session level timeout set to 1s"
  ) {
    setupEnv(createConfig("2s", "1s"))
    getStatementTimeout() shouldBe Some("2s")
    DB localTx { implicit session =>
      session.queryTimeout(1)
      withClue("should spend sleep at least 0.9s without timeout") {
        val before = System.nanoTime
        val res =
          sql"SELECT pg_sleep(0.9)"
            .map(rs => rs)
            .single
            .apply()
        val duration = (System.nanoTime - before) / 1e9d
        res.nonEmpty shouldEqual true
        duration should (be >= 0.9)
        duration should (be < 1.2)
      }
    }
    getStatementTimeout() shouldBe Some("2s")
    DB localTx { implicit session =>
      session.queryTimeout(1)
      val before = System.nanoTime
      try {
        sql"SELECT pg_sleep(2)"
          .map(rs => rs)
          .single
          .apply()
        fail("should throw timeout exception but didn't")
      } catch {
        case e: PSQLException =>
          e.toString should include("canceling statement due to user request")
      }
      val duration = (System.nanoTime - before) / 1e9d
      duration should (be >= 1.0)
      duration should (be < 1.9)
    }
  }

}
