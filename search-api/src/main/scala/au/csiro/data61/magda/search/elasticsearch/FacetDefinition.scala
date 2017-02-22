package au.csiro.data61.magda.search.elasticsearch

import au.csiro.data61.magda.api.Query
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchImplicits._
import au.csiro.data61.magda.util.DateParser
import au.csiro.data61.magda.util.DateParser._
import com.sksamuel.elastic4s.searches.aggs.AggregationDefinition
import com.sksamuel.elastic4s.searches.queries.QueryDefinition
import com.sksamuel.elastic4s.ElasticDsl._
import org.elasticsearch.search.aggregations.Aggregation
import au.csiro.data61.magda.search.elasticsearch.Queries._
import com.rockymadden.stringmetric.similarity.WeightedLevenshteinMetric
import org.elasticsearch.search.aggregations.bucket.MultiBucketsAggregation
import org.elasticsearch.search.aggregations.bucket.nested.InternalReverseNested

import collection.JavaConverters._
import scalaz.Memo
import java.time.ZoneOffset
import au.csiro.data61.magda.search.elasticsearch.YearFacetDefinition
import com.typesafe.config.Config
import com.sksamuel.elastic4s.ElasticDsl
import au.csiro.data61.magda.api.FilterValue
import au.csiro.data61.magda.api.FilterValue._
import au.csiro.data61.magda.api.Specified
import au.csiro.data61.magda.api.Unspecified

/**
 * Contains ES-specific functionality for a Magda FacetType, which is needed to map all our clever magdaey logic
 * over to elasticsearch which doesn't necessarily simply support it.
 */
trait FacetDefinition {
  /**
   *  The elastic4s aggregation definition for this facet, given a max bucket size
   */
  def aggregationDefinition(limit: Int): AggregationDefinition

  /**
   * Determines whether the passed query has any relevance to this facet - e.g. a query is only relevant to Year if it
   * has some kind of date parameters specified.
   */
  def isRelevantToQuery(query: Query): Boolean

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
  def facetSearchQuery(textQuery: FilterValue[String]): Query

  /**
   * Creates an ES query that will match datasets where the value for this facet matches the exact string passed.
   */
  def exactMatchQuery(query: FilterValue[String]): QueryDefinition

  /**
   * Creates zero or more es queries that will match datasets with the exact match of this facet. E.g. if a Query has
   * publishers "Ballarat Council" and "City of ySdney" (sic), then it will return two Tuples with "Ballarat Council" and
   * "City of ySdney" and their corresponding query definitions. When run against elastic search, the first query will
   * return datasets that have the *exact* publisher value "Ballarat Council" but won't return anything for "City of ySdney"
   * because it's spelled wrong.
   */
  def exactMatchQueries(query: Query): Set[(FilterValue[String], QueryDefinition)]

  /**
   * Reduce a list of facets to fit under the limit
   */
  def truncateFacets(query: Query, matched: Seq[FacetOption], exactMatch: Seq[FacetOption], unmatched: Seq[FacetOption], limit: Int): Seq[FacetOption] = {
    val combined = (exactMatch ++ matched ++ unmatched)
    val lookup = combined.groupBy(_.value)

    // It's possible that some of the options will overlap, so make sure we're only showing the first occurence of each.
    combined.map(_.value)
      .distinct
      .map(lookup.get(_).get.head)
      .take(limit)
  }
}

object FacetDefinition {
  def facetDefForType(facetType: FacetType)(implicit config: Config): FacetDefinition = facetType match {
    case Format    => FormatFacetDefinition
    case Year      => new YearFacetDefinition
    case Publisher => PublisherFacetDefinition
  }
}

object PublisherFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AggregationDefinition = {
    aggregation.terms(Publisher.id).field("publisher.name.untouched").size(limit).missing("Unspecified")
  }

  def isRelevantToQuery(query: Query): Boolean = !query.publishers.isEmpty

  override def filterAggregationQuery(query: Query): QueryDefinition =
    should(
      query.publishers.map(publisherQuery(_))
    ).minimumShouldMatch(1)

  override def removeFromQuery(query: Query): Query = query.copy(publishers = Set())

  override def facetSearchQuery(textQuery: FilterValue[String]): Query = Query(publishers = Set(textQuery))

  override def exactMatchQuery(query: FilterValue[String]): QueryDefinition = exactPublisherQuery(query)

  override def exactMatchQueries(query: Query): Set[(FilterValue[String], QueryDefinition)] = query.publishers.map(publisher => (publisher, exactMatchQuery(publisher)))
}

class YearFacetDefinition(implicit val config: Config) extends FacetDefinition {
  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))

  override def aggregationDefinition(limit: Int): AggregationDefinition =
    aggregation.terms(Year.id).field("years").size(Int.MaxValue)

  override def truncateFacets(query: Query, matched: Seq[FacetOption], exactMatch: Seq[FacetOption], unmatched: Seq[FacetOption], limit: Int): Seq[FacetOption] = {
    lazy val firstYear = query.dateFrom.flatMap(_.map(_.getYear))
    lazy val lastYear = query.dateTo.flatMap(_.map(_.getYear))

    def makeMatchedBins() = makeBins(matched, limit, None, firstYear, lastYear).map(_.copy(matched = true))

    (matched, unmatched) match {
      case (Nil, Nil)       => Nil
      case (matched, Nil)   => super.truncateFacets(query, makeMatchedBins(), Nil, Nil, limit)
      case (Nil, unmatched) => super.truncateFacets(query, Nil, Nil, makeBins(unmatched, limit, None, None, None), limit)
      case (matched, unmatched) =>
        val matchedBins = makeMatchedBins()

        val hole = matchedBins match {
          case Nil => None
          case matchedBins =>
            val lastYear = matchedBins.head.upperBound.get
            val firstYear = matchedBins.last.lowerBound.get
            Some(firstYear, lastYear)
        }

        val remainingFacetSlots = limit - matchedBins.size

        super.truncateFacets(query, matchedBins, Nil, makeBins(unmatched, remainingFacetSlots, hole, None, None), limit)
    }
  }

  def getBinSize(firstYear: Int, lastYear: Int, limit: Int): Int = {
    val yearDifference = lastYear - firstYear
    YearFacetDefinition.YEAR_BIN_SIZES.view.map(yearBinSize => (yearBinSize, yearDifference / yearBinSize)).filter(_._2 < limit).map(_._1).head
  }

  val parseFacets = Memo.mutableHashMapMemo((facets: Seq[FacetOption]) => facets
    .map(facet => (facet.value.split("-").map(_.toInt), facet.hitCount)))

  def makeBins(facets: Seq[FacetOption], limit: Int, hole: Option[(Int, Int)], firstYearOpt: Option[Int], lastYearOpt: Option[Int]): Seq[FacetOption] = {
    lazy val yearsFromFacets = parseFacets(facets)
      .flatMap(_._1)
      .distinct
      .toList
      .sorted

    val firstYear = firstYearOpt.getOrElse(yearsFromFacets.head)
    val lastYear = lastYearOpt.getOrElse(yearsFromFacets.last)

    makeBins(facets, limit, hole, firstYear, lastYear)
  }

  def makeBins(facets: Seq[FacetOption], limit: Int, hole: Option[(Int, Int)], firstYear: Int, lastYear: Int): Seq[FacetOption] = (facets, limit) match {
    case (Nil, _) | (_, 0) => Nil
    case (facets, _) =>
      val binSize = getBinSize(firstYear, lastYear, limit)

      val binsRaw = for (i <- roundDown(firstYear, binSize) to roundUp(lastYear, binSize) by binSize) yield (i, i + binSize - 1)

      val bins = hole.map {
        case (holeStart, holeEnd) =>
          binsRaw.flatMap {
            case (binStart, binEnd) =>
              if (binStart >= holeStart && binEnd <= holeEnd)
                // If bin is entirely within the hole, remove it
                Nil
              else if (binEnd < holeStart || binStart > holeEnd) {
                // If the bin and hole don't intersect at all, just leave the bin as is
                Seq((binStart, binEnd))
              } else if (holeStart > binStart && holeEnd < binEnd) {
                // If hole is entirely within the bin, split it into two - one from the start of the bin to just before the start of the hole, and one from after the end of the hole to the end of the bin
                Seq((binStart, holeStart - 1), (holeEnd + 1, binEnd))
              } else if (holeStart <= binStart && holeEnd <= binEnd) {
                // If hole overlaps the start of the bin, move the bin to cover just after the hole to the end of the bin
                Seq((holeEnd + 1, binEnd))
              } else if (holeStart <= binEnd && holeEnd >= binStart) {
                // If hole overlaps the end of the bin, move the bin to cover the start of the bin to just before the hole starts
                Seq((binStart, holeStart - 1))
              } else {
                throw new RuntimeException(s"Could not find a way to reconcile the bin ($binStart-$binEnd) with hole ($holeStart-$holeEnd)")
              }
          }
      } getOrElse binsRaw take limit

      bins.reverse.map {
        case (bucketStart, bucketEnd) =>
          val parsedFacets = parseFacets(facets)

          val hitCount = parsedFacets.filter {
            case (years, count) =>
              val facetStart = years.head
              val facetEnd = years.last

              (facetStart >= bucketStart && facetStart <= bucketEnd) || // facetStart is in the bucket bounds
                (facetEnd >= bucketStart && facetEnd <= bucketEnd) || // facetEnd is in the bucket bounds
                (facetStart <= bucketStart && facetEnd >= bucketEnd) // The facet completely overlaps the bucket
          }.map {
            case (array, integer) =>
              (array, integer)
          }.foldLeft(0l)(_ + _._2)

          FacetOption(
            value = if (bucketStart != bucketEnd) s"$bucketStart - $bucketEnd" else bucketStart.toString,
            hitCount,
            lowerBound = Some(bucketStart),
            upperBound = Some(bucketEnd)
          )
      }.filter(_.hitCount > 0)
  }

  def roundUp(num: Int, divisor: Int): Int = Math.ceil((num.toDouble / divisor)).toInt * divisor
  def roundDown(num: Int, divisor: Int): Int = Math.floor((num.toDouble / divisor)).toInt * divisor

  override def isRelevantToQuery(query: Query): Boolean = query.dateFrom.isDefined || query.dateTo.isDefined

  override def filterAggregationQuery(query: Query): QueryDefinition = boolQuery().must(dateQueries(query.dateFrom, query.dateTo))

  override def removeFromQuery(query: Query): Query = query.copy(dateFrom = None, dateTo = None)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = {
    val (rawFrom, rawTo) = filterOption.value.split("-") match {
      case Array(date)     => (date, date)
      case Array(from, to) => (from, to)
    }
    //FIXME: This is nah-stee
    (parseDate(rawFrom, false), parseDate(rawTo, true)) match {
      case (DateTimeResult(from), DateTimeResult(to)) =>
        query.dateFrom.flatMap(_.map(x => x.isBefore(to) || x.equals(to))).getOrElse(true) &&
          query.dateTo.flatMap(_.map(x => x.isAfter(from) || x.equals(from))).getOrElse(true)
      case _ => false
    }
  }

  override def facetSearchQuery(textQueryValue: FilterValue[String]) =
    textQueryValue match {
      case Specified(textQuery) =>
        (parseDate(textQuery, false), parseDate(textQuery, true)) match {
          case (DateTimeResult(from), DateTimeResult(to)) => Query(dateFrom = Some(Specified(from)), dateTo = Some(Specified(to)))
          // The idea is that this will come from our own index so it shouldn't ever be some weird wildcard thing
          case _ => throw new RuntimeException("Date " + textQuery + " not recognised")
        }
      case Unspecified =>
        Query(dateFrom = Unspecified, dateTo = Unspecified)
    }

  override def exactMatchQuery(queryValue: FilterValue[String]): QueryDefinition = {
    queryValue match {
      case Specified(query) =>
        val from = DateParser.parseDate(query, false)
        val to = DateParser.parseDate(query, true)

        (from, to) match {
          case (DateTimeResult(fromInstant), DateTimeResult(toInstant)) => exactDateQuery(fromInstant, toInstant)
        }
      case Unspecified => Queries.dateUnspecifiedQuery
    }
  }

  override def exactMatchQueries(query: Query): Set[(FilterValue[String], QueryDefinition)] = Set()
}

object YearFacetDefinition {
  val YEAR_BIN_SIZES = List(1, 2, 5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000)
}

object FormatFacetDefinition extends FacetDefinition {
  override def aggregationDefinition(limit: Int): AggregationDefinition =
    aggregation nested Format.id path "distributions" aggs {
      val termsAgg = aggregation terms "nested" field "distributions.format.untokenized" size limit includeExclude (Seq(), Seq("")) aggs {
        aggregation reverseNested "reverse"
      }

      termsAgg.builder.missing("Unspecified")

      termsAgg
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

  override def isRelevantToQuery(query: Query): Boolean = !query.formats.isEmpty

  override def filterAggregationQuery(query: Query): QueryDefinition =
    //    ElasticDsl.matchAllQuery()
    should(query.formats.map(exactFormatQuery(_)))
      .minimumShouldMatch(1)

  override def isFilterOptionRelevant(query: Query)(filterOption: FacetOption): Boolean = query.formats.exists {
    case Specified(format) => WeightedLevenshteinMetric(10, 0.1, 1).compare(format.toLowerCase, filterOption.value.toLowerCase) match {
      case Some(distance) => distance < 1.5
      case None           => false
    }
    case Unspecified => false
  }

  override def removeFromQuery(query: Query): Query = query.copy(formats = Set())
  override def facetSearchQuery(textQuery: FilterValue[String]) = Query(formats = Set(textQuery))

  override def exactMatchQuery(query: FilterValue[String]): QueryDefinition = exactFormatQuery(query)

  override def exactMatchQueries(query: Query): Set[(FilterValue[String], QueryDefinition)] = query.formats.map(format => (format, exactMatchQuery(format)))
}