package au.csiro.data61.magda

import ch.qos.logback.core.PropertyDefinerBase

class LogbackConfigPropertyDefiner extends PropertyDefinerBase {
  var propertyName = ""
  val config = AppConfig.conf()

  override def getPropertyValue: String = {
    config.getString(propertyName)
  }

  def setPropertyName(propertyName: String): Unit = {
    this.propertyName = propertyName
  }
}
