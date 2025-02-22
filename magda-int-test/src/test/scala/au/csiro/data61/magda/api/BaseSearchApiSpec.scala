package au.csiro.data61.magda.api

import java.util.concurrent.{ConcurrentHashMap, ConcurrentLinkedQueue}
import java.util.function.Consumer
import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.client.{AuthApiClient, EmbeddingApiClient}
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.model.Registry._
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.ElasticSearchQueryer
import au.csiro.data61.magda.search.elasticsearch.Indices
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.util.ApiGenerators.textQueryGen
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import au.csiro.data61.magda.test.util.{Generators, TestActorSystem}

import scala.collection.mutable
import scala.concurrent.Future
import scala.concurrent.duration.DurationInt
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.test.MockServer
import au.csiro.data61.magda.test.opa.ResponseDatasetAllowAll
import org.mockserver.client.MockServerClient
import org.mockserver.model.{HttpRequest, HttpResponse}
import org.scalacheck.{Gen, Shrink}
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}

trait BaseSearchApiSpec
    extends BaseApiSpec
    with Protocols
    with ResponseDatasetAllowAll {
  val INSERTION_WAIT_TIME = 500 seconds

  val cleanUpQueue = new ConcurrentLinkedQueue[String]()
  val cleanUpQueueEachTest = new ConcurrentLinkedQueue[String]()

  implicit def indexShrinker(
      implicit s: Shrink[String],
      s1: Shrink[List[DataSet]],
      s2: Shrink[Route]
  ): Shrink[(String, List[DataSet], Route, () => Unit)] =
    Shrink[(String, List[DataSet], Route, () => Unit)] {
      case (indexName, dataSets, route, delFunc) ⇒
        Shrink
          .shrink(dataSets)
          .map(shrunkDataSets ⇒ {
            // Have this on warn level so it keeps travis entertained in long shrinks.
            logger.error(
              "Shrunk datasets to size {} from {}",
              shrunkDataSets.size,
              dataSets.size
            )

            val result = putDataSetsInIndex(shrunkDataSets, true)
            result
          })
    }

  def queryToText(query: Query): String = {
    textQueryGen(Gen.const(query)).retryUntil(_ => true).sample.get._1
  }

  implicit def textQueryShrinker(
      implicit s: Shrink[String],
      s1: Shrink[Query]
  ): Shrink[(String, Query)] = Shrink[(String, Query)] {
    case (queryString, queryObj) ⇒
      Shrink.shrink(queryObj).map { shrunkQuery ⇒
        (queryToText(shrunkQuery), shrunkQuery)
      }
  }

  def emptyIndexGen: Gen[(String, List[DataSet], Route, () => Unit)] =
    Gen.delay {
      genIndexForSize(0)
    }

  def indexGen: Gen[(String, List[DataSet], Route, () => Unit)] =
    Gen.delay {
      Gen.choose(50, 70).flatMap { size =>
        genIndexForSize(size)
      }
    }

  def smallIndexGen: Gen[(String, List[DataSet], Route, () => Unit)] =
    Gen.delay {
      Gen.choose(0, 10).flatMap { size =>
        genIndexForSize(size)
      }
    }

  def mediumIndexGen: Gen[(String, List[DataSet], Route, () => Unit)] =
    indexGen

  def tenantsIndexGen(
      tenantIds: List[BigInt],
      cleanAfterEach: Boolean = true
  ): Gen[(String, List[DataSet], Route, () => Unit)] =
    Gen.delay {
      Gen.choose(0, 10).flatMap { size =>
        genIndexForTenantAndSize(size, tenantIds, cleanAfterEach)
      }
    }

  def genIndexForTenantAndSize(
      rawSize: Int,
      tenantIds: List[BigInt],
      cleanAfterEach: Boolean = true
  ): (String, List[DataSet], Route, () => Unit) = {
    val size = rawSize % 100
    // We are not using cached indexes here.  inputCache stays here simply to avoid
    // too many changes in the interfaces.
    val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty
    val dataSets = tenantIds.flatMap(
      tenantId =>
        Gen
          .listOfN(size, Generators.dataSetGen(inputCache, tenantId))
          .retryUntil(_ => true)
          .sample
          .get
    )
    inputCache.clear()
    putDataSetsInIndex(dataSets, cleanAfterEach)
  }

  /**
    * Generate index with specified size
    * We will always clean up the cache for each test
    * @param rawSize
    * @return
    */
  def genIndexForSize(
      rawSize: Int
  ): (String, List[DataSet], Route, () => Unit) = {
    val size = rawSize % 100

    getFromIndexCache(size) match {
      case (cacheKey, None) ⇒
        logger.info("Cache miss for {}", cacheKey)
        val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty

        val future = Future {
          val dataSets = Gen
            .listOfN(size, Generators.dataSetGen(inputCache))
            .retryUntil(_ => true)
            .sample
            .get
          putDataSetsInIndex(
            dataSets,
            cleanAfterEach = false,
            indexNameTag = Some(size.toString)
          )
        }
        BaseSearchApiSpec.genCache.put(cacheKey, future)
        future.await(INSERTION_WAIT_TIME)

      case (cacheKey, Some(cachedValue)) ⇒
        logger.info("Cache hit for {}", cacheKey)
        val value: (String, List[DataSet], Route, () => Unit) =
          cachedValue.await(INSERTION_WAIT_TIME)
        value
    }
  }

  def getFromIndexCache(
      size: Int
  ): (Int, Option[Future[(String, List[DataSet], Route, () => Unit)]]) = {
    //    val cacheKey = if (size < 20) size
    //    else if (size < 50) size - size % 3
    //    else if (size < 100) size - size % 4
    //    else size - size % 25
    val cacheKey = size
    logger.debug(cacheKey.toString)
    (cacheKey, Option(BaseSearchApiSpec.genCache.get(cacheKey)))
  }

  def putDataSetsInIndex(
      dataSets: List[DataSet],
      // whether the created index should be removed after each test (default `true`) or after all test (`false`)
      cleanAfterEach: Boolean = true,
      noAutoDelete: Boolean = false,
      indexNameTag: Option[String] = None
  ) = {

    val queue = if (cleanAfterEach) cleanUpQueueEachTest else cleanUpQueue

    blockUntilNotRed()

    val rawIndexName = (if (indexNameTag.isEmpty) ""
                        else
                          indexNameTag.get + "-") + java.util.UUID.randomUUID.toString
    val fakeIndices = FakeIndices(rawIndexName)

    val indexNames = List(
      fakeIndices.getIndex(config, Indices.DataSetsIndex),
      fakeIndices.getIndex(config, Indices.PublishersIndex),
      fakeIndices.getIndex(config, Indices.FormatsIndex)
    )

    val searchQueryer = new ElasticSearchQueryer(fakeIndices)
    val authApiClient = new AuthApiClient()
    val api = new SearchApi(authApiClient, searchQueryer)(config, logger)
    val indexer = new ElasticSearchIndexer(
      MockClientProvider,
      fakeIndices,
      embeddingApiClient
    )

    val convertedDataSets = dataSets.map(
      d =>
        d.copy(
          publisher = d.publisher
            .map(p => p.copy(acronym = getAcronymFromPublisherName(p.name)))
        )
    )

    val stream = Source.fromIterator[DataSet](() => convertedDataSets.iterator)

    indexer.ready.await(INSERTION_WAIT_TIME)

    indexNames.foreach { idxName =>
      blockUntilIndexExists(idxName)
      if (!noAutoDelete) {
        queue.add(idxName)
      }
    }

    indexer.index(stream).await(INSERTION_WAIT_TIME)

    indexNames.foreach { idxName =>
      refresh(idxName)
    }

    blockUntilExactCount(dataSets.size, indexNames(0))

    val deleteIndicesImmediately = () => {
      if (noAutoDelete) {
        blockUntilNotRed()
        indexNames.foreach { idxName =>
          logger.debug(s"Deleting index $idxName")
          client
            .execute(ElasticDsl.deleteIndex(idxName))
            .await(INSERTION_WAIT_TIME)
        }
      }
    }

    (indexNames(0), dataSets, api.routes, deleteIndicesImmediately)
  }

  def encodeForUrl(query: String) = java.net.URLEncoder.encode(query, "UTF-8")

  def cleanUpIndexes(cleanAfterEach: Boolean = false) = {
    blockUntilNotRed()
    val queue = if (cleanAfterEach) cleanUpQueueEachTest else cleanUpQueue
    queue
      .iterator()
      .forEachRemaining(new Consumer[String] {
        override def accept(indexName: String) = {
          logger.debug(s"Deleting index $indexName")
          client
            .execute(ElasticDsl.deleteIndex(indexName))
            .await(INSERTION_WAIT_TIME)
          queue.remove()
        }
      })
  }

  override def afterAll() {
    super.afterEach()
    // clean up indices that should stay till all tests are done
    cleanUpIndexes()
  }

  override def afterEach() {
    super.afterEach()
    // clean up indices that should be remove after each test
    cleanUpIndexes(true)
  }
}

object BaseSearchApiSpec {

  val genCache: ConcurrentHashMap[Int, Future[
    (String, List[DataSet], Route, () => Unit)
  ]] =
    new ConcurrentHashMap()
}
