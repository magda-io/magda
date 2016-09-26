package au.csiro.data61.magda.external

import com.typesafe.config.Config
import java.net.URL
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType._

case class InterfaceConfig(name: String, interfaceType: ExternalInterfaceType, baseUrl: URL, pageSize: Long, fakeConfig: Option[FakeConfig])
case class FakeConfig(datasetCount: Long, datasetPath: String)

object InterfaceConfig {
  def apply(config: Config): InterfaceConfig = {
    val isFaked = config.hasPath("isFaked") && config.getBoolean("isFaked")

    new InterfaceConfig(
      name = config.getString("name"),
      interfaceType = ExternalInterfaceType.withName(config.getString("type")),
      baseUrl = new URL(config.getString("baseUrl")),
      pageSize = config.getLong("pageSize"),
      fakeConfig = {
        if (isFaked && config.hasPath("fake"))
          Some(new FakeConfig(config.getLong("fake.datasetTotal"), config.getString("fake.dataFilePath")))
        else None
      }
    )
  }
}