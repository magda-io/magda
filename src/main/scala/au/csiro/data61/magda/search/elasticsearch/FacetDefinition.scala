package au.csiro.data61.magda.search.elasticsearch

import scala.collection.JavaConverters._
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
import au.csiro.data61.magda.util.DateParser
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.search.aggregations.InternalMultiBucketAggregation.InternalBucket
import org.elasticsearch.search.aggregations.bucket.nested.InternalReverseNested
import org.elasticsearch.search.aggregations.bucket.histogram.Histogram

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
  def filterAggregationQuery(query: Query): QueryDefinition

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
   * Creates an ES query that will match datasets where the value for this facet matches the exact string passed.
   */
  def exactMatchQuery(query: String): QueryDefinition

  /**
   * Creates zero or more es queries that will match datasets with the exact match of this facet. E.g. if a Query has
   * publishers "Ballarat Council" and "City of ySdney" (sic), then it will return two Tuples with "Ballarat Council" and
   * "City of ySdney" and their corresponding query definitions. When run against elastic search, the first query will
   * return datasets that have the *exact* publisher value "Ballarat Council" but won't return anything for "City of ySdney"
   * because it's spelled wrong.
   */
  def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)]

  /**
   * Once the facets are extracted into FacetOptions, optionally perform some post-processing - e.g. reduce them into smaller
   * groups or change the values so they reference the facet before and after.
   */
  def postProcessFacets(inputFacets: Seq[FacetOption], limit: Int): Seq[FacetOption] = inputFacets
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

  override def filterAggregationQuery(query: Query): QueryDefinition =
    should(
      query.publishers.map(publisherQuery(_))
    ).minimumShouldMatch(1)

  override def removeFromQuery(query: Query): Query = query.copy(publishers = Nil)

  override def facetSearchQuery(textQuery: String): Query = Query(publishers = Seq(textQuery))

  override def exactMatchQuery(query: String): QueryDefinition = exactPublisherQuery(query)

  override def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = query.publishers.map(publisher => (publisher, exactMatchQuery(publisher)))
}

object YearFacetDefinition extends FacetDefinition {
  val yearBinSizes = List(1, 2, 5, 10, 25, 50)

  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation.histogram(Year.id).field("years").interval(1).order(Histogram.Order.KEY_DESC)

  def roundUp(num: Int, divisor: Int): Int = Math.ceil((num.toDouble / divisor)).toInt * divisor
  def roundDown(num: Int, divisor: Int): Int = Math.floor((num.toDouble / divisor)).toInt * divisor

  override def postProcessFacets(inputFacets: Seq[FacetOption], limit: Int): Seq[FacetOption] = inputFacets match {
    case Nil => Nil
    case inputFacets =>
      val lastYear = inputFacets.head.value.toInt
      val firstYear = inputFacets.last.value.toInt

      val yearDifference = lastYear - firstYear
      val binSize = yearBinSizes.view.map(x => (x, yearDifference / x)).filter(_._2 <= limit).map(_._1).head

      val bins = for (i <- roundDown(firstYear, binSize) to roundUp(lastYear, binSize) by binSize) yield (i, i + binSize - 1)

      val yearLookup = inputFacets.groupBy(_.value.toInt).mapValues(_.head.hitCount)

      bins.reverse.map {
        case (start, end) =>
          val yearsAffected = for (i <- start to end) yield i
          val hitCount = yearsAffected.foldRight(0l)((year, count) => count + yearLookup.get(year).getOrElse(0l))

          FacetOption(
            value = if (start != end) s"$start - $end" else start.toString,
            hitCount,
            lowerBound = Some(start.toString),
            upperBound = Some(end.toString)
          )
      }.filter(_.hitCount > 0)
  }

  override def relatedToQuery(query: Query): Boolean = query.dateFrom.isDefined || query.dateTo.isDefined

  override def filterAggregationQuery(query: Query): QueryDefinition =
    must {
      val fromQuery = query.dateFrom.map(dateFromQuery(_))
      val toQuery = query.dateTo.map(dateToQuery(_))

      Seq(fromQuery, toQuery).flatten
    }

  override def removeFromQuery(query: Query): Query = query.copy(dateFrom = None, dateTo = None)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = {
    //FIXME: This is nah-stee
    (parseDate(filterOption.value, false), parseDate(filterOption.value, true)) match {
      case (InstantResult(from), InstantResult(to)) =>
        query.dateFrom.map(x => x.isBefore(to) || x.equals(to)).getOrElse(true) &&
          query.dateTo.map(x => x.isAfter(from) || x.equals(from)).getOrElse(true)
    }
  }

  override def facetSearchQuery(textQuery: String) = (parseDate(textQuery, false), parseDate(textQuery, true)) match {
    case (InstantResult(from), InstantResult(to)) => Query(dateFrom = Some(from), dateTo = Some(to))
    // The idea is that this will come from our own index so it shouldn't even be some weird wildcard thing
    case _                                        => throw new RuntimeException("Date " + query + " not recognised")
  }

  override def exactMatchQuery(query: String): QueryDefinition = {
    val from = DateParser.parseDate(query, false)
    val to = DateParser.parseDate(query, true)

    (from, to) match {
      case (InstantResult(fromInstant), InstantResult(toInstant)) => exactDateQuery(fromInstant, toInstant)
    }
  }

  override def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = Nil
}

object FormatFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AbstractAggregationDefinition =
    aggregation nested Format.id path "distributions" aggregations {
      aggregation terms "nested" field "distributions.format.untokenized" size limit aggs {
        aggregation reverseNested "reverse"
      }
    }

  override def extractFacetOptions(aggregation: Aggregation): Seq[FacetOption] = {
    val nested = aggregation.getProperty("nested").asInstanceOf[MultiBucketsAggregation]

    nested.getBuckets.asScala.map { bucket =>
      val innerBucket = bucket.getAggregations.asScala.head.asInstanceOf[InternalReverseNested]

      new FacetOption(
        value = bucket.getKeyAsString,
        hitCount = innerBucket.getDocCount
      )
    }
  }

  override def relatedToQuery(query: Query): Boolean = !query.formats.isEmpty

  override def filterAggregationQuery(query: Query): QueryDefinition =
    should(query.formats.map(formatQuery(_)))
      .minimumShouldMatch(1)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = query.formats.exists(
    format => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
      case Some(distance) => distance < 1.5
      case None           => false
    })

  override def removeFromQuery(query: Query): Query = query.copy(formats = Nil)
  override def facetSearchQuery(textQuery: String) = Query(formats = Seq(textQuery))

  override def exactMatchQuery(query: String): QueryDefinition = exactFormatQuery(query)

  override def exactMatchQueries(query: Query): Seq[(String, QueryDefinition)] = query.formats.map(format => (format, exactMatchQuery(format)))
}