package au.csiro.data61.magda.registry

import scalikejdbc.config.TypesafeConfig
import scalikejdbc.config.TypesafeConfigReader
import scalikejdbc.config.EnvPrefix
import scalikejdbc.config.DBs
import com.typesafe.config.Config
import scalikejdbc.ConnectionPoolFactoryRepository

case class DBsWithEnvSpecificConfig(configToUse: Config)
    extends DBs
    with TypesafeConfigReader
    with TypesafeConfig
    with EnvPrefix {

  override val config: Config = configToUse
  MagdaDBConnectionPoolFactory.setConfig(configToUse)

  if (ConnectionPoolFactoryRepository.get("magda").isEmpty) {
    ConnectionPoolFactoryRepository.add("magda", MagdaDBConnectionPoolFactory)
  }
}
