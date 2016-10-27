package au.csiro.data61.magda.search.elasticsearch

import com.sksamuel.elastic4s.QueryDefinition
import com.sksamuel.elastic4s.AbstractAggregationDefinition
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.model.misc
import au.csiro.data61.magda.api.Query
import org.elasticsearch.search.aggregations.Aggregation
import com.sksamuel.elastic4s.ElasticDsl._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.util.DateParser._
import org.elasticsearch.search.aggregations.bucket.terms.Terms.Order
import com.rockymadden.stringmetric.similarity.WeightedLevenshteinMetric
import au.csiro.data61.magda.search.elasticsearch.Queries._

/**
 * Contains ES-specific functionality for a Magda FacetType, which is needed to map all our clever magdaey logic
 * over to elasticsearch which doesn't necessarily simply support it.
 */
trait FacetDefinition {
  /**
   *  The elastic4s aggregation definition for this facet, given a max bucket size
   */
  def aggregationDefinition(limit: Int): AbstractAggregationDefinition

  /**
   * Determines whether the passed query has any relevance to this facet - e.g. a query is only relevant to Year if it
   * has some kind of date parameters specified.
   */
  def relatedToQuery(query: Query): Boolean

  /**
   * Returns a QueryDefinition for only the part of the query that's relevant for this facet... e.g. for Year it creates
   * a query that looks for anything with a date within the Query's date parameters.
   */
  def filterAggregationQuery(limit: Int, query: Query): QueryDefinition

  /**
   *  Optional filter for the buckets that are returned from aggregation. This is useful for facets that are based on
   *  1:M relationships, as even filtering on the value of a facet tends to return a lot of nonsense results.
   *
   *  E.g. if I query for datasets with format "PDF" then I could still get "ZIP"  at the top of the resulting format
   *    aggregation, as long as every dataset with format "PDF" also has format "ZIP". So I can use this to filter out
   *    any aggregation results that aren't close to "PDF".
   */
  def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = true

  /**
   * Given an aggregation resolved from ElasticSearch, extract the actual individual FacetOptions. This has to be specified
   * per-facet because some facets use nested aggregations, so we need code to reach into the right sub-aggregation.
   */
  def extractFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation

  /**
   * Returns a query with the details relevant to this facet removed - useful for showing what options there *would* be
   * for this aggregation if it wasn't being filtered.
   */
  def removeFromQuery(query: Query): Query

  /**
   * Builds a Query for datasets with facets that match the supplied string. E.g. for publisher "Ballarat Council", this
   * creates a query that matches datasets with publisher "Ballarat Council"
   */
  def facetSearchQuery(textQuery: String): Query

  /**
   * Creates zero or more es queries that will match datasets with the exact match of this facet. E.g. if a Query has
   * publishers "Ballarat Council" and "City of ySdney" (sic), then it will return two Tuples with "Ballarat Council" and
   * "City of ySdney" and their corresponding query definitions. When run against elastic search, the first query will
   * return datasets that have the *exact* publisher value "Ballarat Council" but won't return anything for "City of ySdney"
   * because it's spelled wrong.
   */
  def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = Nil
}

object FacetDefinition {
  def facetDefForType(facetType: FacetType): FacetDefinition = facetType match {
    case Format    => FormatFacetDefinition
    case Year      => YearFacetDefinition
    case Publisher => PublisherFacetDefinition
  }
}

object PublisherFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition = {
    aggregation.terms(Publisher.id).field("publisher.name.untouched").size(limit)
  }

  def relatedToQuery(query: Query): Boolean = !query.publishers.isEmpty

  override def filterAggregationQuery(limit: Int, query: Query): QueryDefinition =
    should(
      query.publishers.map(publisherQuery(_))
    ).minimumShouldMatch(1)

  override def removeFromQuery(query: Query): Query = query.copy(publishers = Nil)

  override def facetSearchQuery(textQuery: String): Query = Query(publishers = Seq(textQuery))

  override def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = query.publishers.map(publisher => (publisher, exactPublisherQuery(publisher)))
}

object YearFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation.terms(Year.id).field("years").order(Order.term(false)).size(limit)

  override def relatedToQuery(query: Query): Boolean = query.dateFrom.isDefined || query.dateTo.isDefined

  override def filterAggregationQuery(limit: Int, query: Query): QueryDefinition =
    must {
      val fromQuery = query.dateFrom.map(dateFromQuery(_))
      val toQuery = query.dateTo.map(dateToQuery(_))

      Seq(fromQuery, toQuery).filter(_.isDefined).map(_.get)
    }

  override def removeFromQuery(query: Query): Query = query.copy(dateFrom = None, dateTo = None)

  override def facetSearchQuery(textQuery: String) = (parseDate(textQuery, false), parseDate(textQuery, true)) match {
    case (InstantResult(from), InstantResult(to)) => Query(dateFrom = Some(from), dateTo = Some(to))
    // The idea is that this will come from our own index so it shouldn't even be some weird wildcard thing
    case _                                        => throw new RuntimeException("Date " + query + " not recognised")
  }
}

object FormatFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation nested Format.id path "distributions" aggregations {
      aggregation terms "abc" field "distributions.format.untokenized" size limit
    }

  override def extractFacetOptions(aggregation: Aggregation): Seq[FacetOption] = aggregation.getProperty("abc").asInstanceOf[Aggregation]

  override def relatedToQuery(query: Query): Boolean = !query.formats.isEmpty

  override def filterAggregationQuery(limit: Int, query: Query): QueryDefinition =
    should(query.formats.map(formatQuery(_)))
      .minimumShouldMatch(1)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = query.formats.exists(
    format => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
      case Some(distance) => distance < 1.5
      case None           => false
    })

  override def removeFromQuery(query: Query): Query = query.copy(formats = Nil)
  override def facetSearchQuery(textQuery: String) = Query(formats = Seq(textQuery))
  override def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = query.formats.map(format => (format, formatQuery(format)))
}