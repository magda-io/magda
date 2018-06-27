package au.csiro.data61.magda.search.elasticsearch.BuilderFns

import com.sksamuel.elastic4s.http.search.queries.nested.InnerHitQueryBodyFn
import com.sksamuel.elastic4s.json.{XContentBuilder, XContentFactory}
import com.sksamuel.elastic4s.searches.queries.HasParentQueryDefinition

object HasParentBodyFn {

  def apply(q: HasParentQueryDefinition): XContentBuilder = {
    val builder = XContentFactory.jsonBuilder()
    builder.startObject("has_parent")
    builder.field("parent_type", q.`type`)
    builder.rawField("query", QueryBuilderFn(q.query))
    q.ignoreUnmapped.foreach(builder.field("ignore_unmapped", _))
    if (q.score)
      builder.field("score", true)
    q.boost.foreach(builder.field("boost", _))
    q.innerHit.foreach(inner => builder.rawField("inner_hits", InnerHitQueryBodyFn(inner)))
    q.queryName.foreach(builder.field("_name", _))
    builder.endObject()
    builder.endObject()
    builder
  }
}
