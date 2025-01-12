package au.csiro.data61.magda.util

import com.typesafe.config.Config

import java.util.concurrent.TimeUnit
import scala.collection.breakOut
import scala.collection.JavaConverters._
import scala.concurrent.duration.{Duration, FiniteDuration}

object RichConfig {
  implicit class RichConfig(val underlying: Config) extends AnyVal {

    def getOptionalDuration(path: String): Option[FiniteDuration] =
      if (underlying.hasPath(path)) {
        Some(
          Duration.fromNanos(underlying.getDuration(path, TimeUnit.NANOSECONDS))
        )
      } else {
        None
      }

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

    def getOptionalInt(path: String): Option[Int] =
      if (underlying.hasPath(path)) {
        Some(underlying.getInt(path))
      } else {
        None
      }

    def getOptionalIntList(path: String): Option[List[Int]] =
      if (underlying.hasPath(path)) {
        Some(
          underlying.getIntList(path).asScala.map(_.intValue)(breakOut)
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
