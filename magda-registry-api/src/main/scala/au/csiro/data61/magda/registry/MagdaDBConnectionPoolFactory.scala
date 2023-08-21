package au.csiro.data61.magda.registry
import com.typesafe.config.Config
import au.csiro.data61.magda.AppConfig
import scalikejdbc._

object MagdaDBConnectionPoolFactory extends ConnectionPoolFactory {

  private var _config: Option[Config] = None

  def setConfig(config: Config) = {
    _config = Some(config)
  }

  def config: Config = {
    if (_config.nonEmpty) {
      _config.get
    } else {
      AppConfig.conf()
    }
  }

  override def apply(
      url: String,
      user: String,
      password: String,
      settings: ConnectionPoolSettings = ConnectionPoolSettings()
  ) = {
    if (!config.hasPath("db-query.global-timeout")) {
      new MagdaDBConnectionPool(url, user, password, settings)
    } else {
      val globalTimeOutSetting = config.getDuration(
        "db-query.global-timeout",
        scala.concurrent.duration.SECONDS
      )
      if (globalTimeOutSetting > 0) {
        new MagdaDBConnectionPool(
          url,
          user,
          password,
          settings,
          List(s"SET statement_timeout = '${globalTimeOutSetting}s'")
        )
      } else if (globalTimeOutSetting == 0) {
        new MagdaDBConnectionPool(url, user, password, settings)
      } else {
        throw new Exception(
          "Invalid db-query.global-timeout config: should be larger than 0"
        )
      }
    }
  }
}
