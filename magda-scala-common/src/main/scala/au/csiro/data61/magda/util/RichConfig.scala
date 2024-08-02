package au.csiro.data61.magda.util

import com.typesafe.config.Config
import scala.collection.breakOut
import scala.collection.JavaConverters._

object RichConfig {
  implicit class RichConfig(val underlying: Config) extends AnyVal {

    def getOptionalString(path: String): Option[String] =
      if (underlying.hasPath(path)) {
        Some(underlying.getString(path))
      } else {
        None
      }

    def getOptionalStringList(path: String): Option[List[String]] =
      if (underlying.hasPath(path)) {
        Some(
          underlying.getStringList(path).asScala.toList
        )
      } else {
        None
      }

    def getOptionalBoolean(path: String): Option[Boolean] =
      if (underlying.hasPath(path)) {
        Some(underlying.getBoolean(path))
      } else {
        None
      }

    def getOptionalBooleanList(path: String): Option[List[Boolean]] =
      if (underlying.hasPath(path)) {
        Some(
          underlying.getBooleanList(path).asScala.map(_.booleanValue)(breakOut)
        )
      } else {
        None
      }

    def getOptionalLong(path: String): Option[Long] =
      if (underlying.hasPath(path)) {
        Some(underlying.getLong(path))
      } else {
        None
      }

    def getOptionalLongList(path: String): Option[List[Long]] =
      if (underlying.hasPath(path)) {
        Some(
          underlying.getLongList(path).asScala.map(_.longValue)(breakOut)
        )
      } else {
        None
      }

    def getOptionalDouble(path: String): Option[Double] =
      if (underlying.hasPath(path)) {
        Some(underlying.getDouble(path))
      } else {
        None
      }

    def getOptionalDoubleList(path: String): Option[List[Double]] =
      if (underlying.hasPath(path)) {
        Some(
          underlying.getDoubleList(path).asScala.map(_.doubleValue)(breakOut)
        )
      } else {
        None
      }
  }
}
