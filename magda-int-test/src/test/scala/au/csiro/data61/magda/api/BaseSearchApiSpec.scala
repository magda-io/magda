package au.csiro.data61.magda.api

import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.function.Consumer

import scala.concurrent.Future
import scala.concurrent.duration.DurationInt

import org.scalacheck.Gen
import org.scalacheck.Shrink

import com.sksamuel.elastic4s.ElasticDsl

import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.util.ApiGenerators.textQueryGen
import au.csiro.data61.magda.test.util.Generators
import com.sksamuel.elastic4s.Indexes

trait BaseSearchApiSpec extends BaseApiSpec with Protocols {
  val INSERTION_WAIT_TIME = 90 seconds

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()

  implicit def indexShrinker(implicit s: Shrink[String], s1: Shrink[List[DataSet]], s2: Shrink[Route]): Shrink[(String, List[DataSet], Route)] = Shrink[(String, List[DataSet], Route)] {
    case (indexName, dataSets, route) ⇒
      Shrink.shrink(dataSets).map(shrunkDataSets ⇒ {
        // Have this on warn level so it keeps travis entertained in long shrinks.
        logger.error("Shrunk datasets to size {} from {}", shrunkDataSets.size, dataSets.size)

        val result = putDataSetsInIndex(shrunkDataSets)
        cleanUpQueue.add(result._1)
        result
      })
  }

  def queryToText(query: Query): String = {
    textQueryGen(Gen.const(query)).retryUntil(_ => true).sample.get._1
  }

  implicit def textQueryShrinker(implicit s: Shrink[String], s1: Shrink[Query]): Shrink[(String, Query)] = Shrink[(String, Query)] {
    case (queryString, queryObj) ⇒
      Shrink.shrink(queryObj).map { shrunkQuery ⇒
        (queryToText(shrunkQuery), shrunkQuery)
      }
  }

  def indexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(size)
      }
    }

  def emptyIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      genIndexForSize(0)
    }

  def smallIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(Math.round(Math.sqrt(size.toDouble).toFloat))
      }
    }

  def mediumIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.size.flatMap { size ⇒
        genIndexForSize(Math.round(Math.sqrt(size.toDouble).toFloat) * 5)
      }
    }

  def genIndexForSize(size: Int): (String, List[DataSet], Route) = {
    //    getFromIndexCache(size) match {
    //      case (cacheKey, None) ⇒
    val future = Future {
      val dataSets = Gen.listOfN(size, Generators.dataSetGen).retryUntil(_ => true).sample.get
      putDataSetsInIndex(dataSets)
    }

    //        BaseSearchApiSpec.genCache.put(cacheKey, future)
//    logger.debug("Cache miss for {}", cacheKey)

    future.await(INSERTION_WAIT_TIME)
    //      case (cacheKey, Some(cachedValue)) ⇒
    //        logger.debug("Cache hit for {}", cacheKey)
    //
    //        val value = cachedValue.await(INSERTION_WAIT_TIME)
    //
    //        value
  }

  def getFromIndexCache(size: Int): (Int, Option[Future[(String, List[DataSet], Route)]]) = {
    val cacheKey = if (size < 10) size
    else if (size < 50) size - size % 5
    else if (size < 100) size - size % 10
    else size - size % 25
    //    val cacheKey = size
    (cacheKey, Option(BaseSearchApiSpec.genCache.get(cacheKey)))
  }

  def putDataSetsInIndex(dataSets: List[DataSet]) = {
    val rawIndexName = java.util.UUID.randomUUID.toString
    val fakeIndices = FakeIndices(rawIndexName)

    val indexName = fakeIndices.getIndex(config, Indices.DataSetsIndex)
    val searchQueryer = new ElasticSearchQueryer(fakeIndices)
    val api = new SearchApi(searchQueryer)(config, logger)
    val indexer = new ElasticSearchIndexer(MockClientProvider, fakeIndices)

    val stream = Source.fromIterator[DataSet](() => dataSets.iterator)

    indexer.ready.await(INSERTION_WAIT_TIME)
    blockUntilIndexExists(indexName)
    indexer.index(new InterfaceConfig("test-catalog", "blah", new URL("http://example.com"), 23), stream).await(INSERTION_WAIT_TIME)
    refresh(indexName)

    //    System.gc()

    blockUntilExactCount(dataSets.size, indexName, fakeIndices.getType(Indices.DataSetsIndexType))

    (indexName, dataSets, api.routes)
  }

  def encodeForUrl(query: String) = java.net.URLEncoder.encode(query, "UTF-8")
  def cleanUpIndexes() = {
    cleanUpQueue.iterator().forEachRemaining(
      new Consumer[String] {
        override def accept(indexName: String) = {
          logger.debug(s"Deleting index $indexName")
          client.execute(ElasticDsl.deleteIndex(indexName)).await()
          cleanUpQueue.remove()
        }
      })
  }

  override def afterEach() {
    super.afterEach()

    cleanUpIndexes()
  }
}

object BaseSearchApiSpec {
  val genCache: ConcurrentHashMap[Int, Future[(String, List[DataSet], Route)]] = new ConcurrentHashMap()
}
