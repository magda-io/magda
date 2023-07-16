package au.csiro.data61.magda.registry

import scalikejdbc.config.TypesafeConfig
import scalikejdbc.config.TypesafeConfigReader
import scalikejdbc.config.EnvPrefix
import scalikejdbc.config.DBs
import com.typesafe.config.{Config, ConfigValueFactory}
import au.csiro.data61.magda.util.UrlUtils

case class DBsWithEnvSpecificConfig(configToUse: Config)
    extends DBs
    with TypesafeConfigReader
    with TypesafeConfig
    with EnvPrefix {

  override val config: Config = setGlobalStatementTimeout(configToUse)

  private def setGlobalStatementTimeout(config: Config): Config = {
    val globalTimeOutSetting = config.getDuration(
      "db-query.global-timeout",
      scala.concurrent.duration.SECONDS
    )
    val globalTimeOutSettingMils = globalTimeOutSetting * 1000
    val dbUrl = config.getString("db.default.url")
    val parsedDbUrl = UrlUtils.parse(dbUrl.replaceFirst("^(?i)jdbc:", ""))
    val statementTimeout = parsedDbUrl.query.paramMap.get("options").flatMap {
      v =>
        val cfgOpts = v.flatMap(optStr => optStr.split("-c "))
        cfgOpts
          .find(cfgOpt => cfgOpt.toLowerCase.startsWith("statement_timeout="))
          .map(
            cfgOpt => cfgOpt.replaceFirst("^(?i)statement_timeout=", "").trim
          )
          .filter(s => !s.isEmpty)
          .map(s => s.toLong)
    }
    if (!statementTimeout.isEmpty) config
    else {
      // set statement_timeout via jdbc connection string
      val newOptStr =
        (s"-c statement_timeout=${globalTimeOutSettingMils}" :: parsedDbUrl.query.paramMap
          .get("options")
          .toVector
          .flatMap(item => item)
          .toList).mkString(" ")

      val newDbUrl = "jdbc:" + parsedDbUrl
        .replaceParams("options", newOptStr)
        .toString()

      config.withValue(
        "db.default.url",
        ConfigValueFactory.fromAnyRef(
          newDbUrl
        )
      )
    }
  }
}
