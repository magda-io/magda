package au.csiro.data61.magda.client

import com.typesafe.config.Config
import redis.clients.jedis.Jedis
import au.csiro.data61.magda.util.RichConfig._

import scala.concurrent.duration.FiniteDuration

/**
  * Minimal blocking Redis client wrapper for shared Scala services.
  *
  * Config paths:
  *   - redis.host
  *   - redis.port
  *   - redis.db
  *   - redis.timeout
  *   - redis.keyPrefix
  */
class RedisClient(
    host: String,
    port: Int,
    db: Int,
    timeout: FiniteDuration,
    keyPrefix: String = ""
) {

  def this(config: Config) = this(
    config.getString("redis.host"),
    config.getInt("redis.port"),
    config.getOptionalInt("redis.db").getOrElse(0),
    config
      .getOptionalDuration("redis.timeout")
      .getOrElse(scala.concurrent.duration.DurationInt(5).seconds),
    config.getOptionalString("redis.keyPrefix").getOrElse("")
  )

  private def withClient[T](op: Jedis => T): T = {
    val jedis = new Jedis(host, port, timeout.toMillis.toInt)
    try {
      if (db != 0) jedis.select(db)
      op(jedis)
    } finally {
      jedis.close()
    }
  }

  private def namespaced(key: String): String =
    if (keyPrefix.nonEmpty) s"$keyPrefix$key" else key

  def set(key: String, value: String): String =
    withClient(_.set(namespaced(key), value))

  def setEx(key: String, ttlSeconds: Int, value: String): String =
    withClient(_.setex(namespaced(key), ttlSeconds, value))

  def sAdd(key: String, values: Seq[String]): Long =
    if (values.isEmpty) 0L
    else withClient(_.sadd(namespaced(key), values: _*))

  def expire(key: String, ttlSeconds: Int): Long =
    withClient(_.expire(namespaced(key), ttlSeconds))

  def delete(key: String): Long =
    withClient(_.del(namespaced(key)))

  def get(key: String): Option[String] =
    withClient(jedis => Option(jedis.get(namespaced(key))))
}
