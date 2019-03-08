package au.csiro.data61.magda.search.elasticsearch

import com.sksamuel.elastic4s.http.search.Aggregations

object AggUtils {
  def toAgg(data: Any): Option[Aggregations] = data match {
    case d: Map[String, Any] => Some(Aggregations(d))
    case _ => None
  }
}
