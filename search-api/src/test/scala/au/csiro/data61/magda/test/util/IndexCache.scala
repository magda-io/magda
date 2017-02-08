package au.csiro.data61.magda.test.util

import java.util.concurrent.ConcurrentHashMap
import scala.concurrent.Future
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.model.misc.{ DataSet, _ }


object IndexCache {
  val genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()
}