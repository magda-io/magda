package au.csiro.data61.magda.util

import com.typesafe.config.Config

object RichConfig {
  implicit class RichConfig(val underlying: Config) extends AnyVal {

    def getOptionalString(path: String): Option[String] =
      if (underlying.hasPath(path)) {
        Some(underlying.getString(path))
      } else {
        None
      }

    def getOptionalBoolean(path: String): Option[Boolean] =
      if (underlying.hasPath(path)) {
        Some(underlying.getBoolean(path))
      } else {
        None
      }

    def getOptionalLong(path: String): Option[Long] =
      if (underlying.hasPath(path)) {
        Some(underlying.getLong(path))
      } else {
        None
      }

    def getOptionalDouble(path: String): Option[Double] =
      if (underlying.hasPath(path)) {
        Some(underlying.getDouble(path))
      } else {
        None
      }
  }
}
