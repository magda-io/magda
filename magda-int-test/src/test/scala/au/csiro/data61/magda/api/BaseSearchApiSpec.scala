package au.csiro.data61.magda.api

import akka.http.scaladsl.server.Route
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.api.model.Protocols
import au.csiro.data61.magda.indexer.search.elasticsearch.ElasticSearchIndexer
import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, RegistryConverters}
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.search.elasticsearch.{ElasticSearchQueryer, Indices}
import au.csiro.data61.magda.test.api.BaseApiSpec
import au.csiro.data61.magda.test.opa.ResponseDatasetAllowAll
import au.csiro.data61.magda.test.util.ApiGenerators.textQueryGen
import au.csiro.data61.magda.test.util.Generators
import com.sksamuel.elastic4s.http.ElasticDsl._
import org.scalacheck.{Gen, Shrink}

import scala.collection.mutable
import scala.concurrent.duration.{DurationInt, FiniteDuration}


trait BaseSearchApiSpec extends BaseApiSpec with RegistryConverters with Protocols with ResponseDatasetAllowAll {
  val INSERTION_WAIT_TIME: FiniteDuration = 500 seconds

  def queryToText(query: Query): String = {
    textQueryGen(Gen.const(query)).retryUntil(_ => true).sample.get._1
  }

  implicit def textQueryShrinker(implicit s: Shrink[String], s1: Shrink[Query]): Shrink[(String, Query)] = Shrink[(String, Query)] {
    case (_, queryObj) ⇒
      Shrink.shrink(queryObj).map { shrunkQuery ⇒
        (queryToText(shrunkQuery), shrunkQuery)
      }
  }

  def emptyIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      genIndexForSize(0)
    }

  def indexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.choose(50, 70).flatMap { size =>
        genIndexForSize(size)
      }
    }
  def smallIndexGen: Gen[(String, List[DataSet], Route)] =
    Gen.delay {
      Gen.choose(0, 10).flatMap { size =>
        genIndexForSize(size)
      }
    }
  def mediumIndexGen: Gen[(String, List[DataSet], Route)] = indexGen

  def tenantsIndexGen(tenantIds: List[BigInt]): Gen[(String, List[DataSet], Route)]  =
    Gen.delay {
      Gen.choose(0, 10).flatMap { size =>
        genIndexForTenantAndSize(size, tenantIds)
      }
    }

  def genIndexForTenantAndSize(rawSize: Int, tenantIds: List[BigInt] = List(MAGDA_ADMIN_PORTAL_ID)): (String, List[DataSet], Route) = {
    val size = rawSize % 100
    // We are not using cached indexes anymore.  inputCache stays here simply to avoid
    // too many changes in the interfaces.
    val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty
    val dataSets = tenantIds.flatMap( tenantId =>
      Gen.listOfN(size, Generators.dataSetGen(inputCache, tenantId)).retryUntil(_ => true).sample.get
    )
    inputCache.clear()
    putDataSetsInIndex(dataSets)
  }

  def genIndexForSize(rawSize: Int): (String, List[DataSet], Route) = {
    val size = rawSize % 100
    // We are not using cached indexes anymore.  inputCache stays here simply to avoid
    // too many changes in the interfaces.
    val inputCache: mutable.Map[String, List[_]] = mutable.HashMap.empty
    val dataSets = Gen.listOfN(size, Generators.dataSetGen(inputCache)).retryUntil(_ => true).sample.get
    inputCache.clear()
    putDataSetsInIndex(dataSets)
  }

  def putDataSetsInIndex(dataSets: List[DataSet]): (String, List[DataSet], Route) = {
    val start = System.currentTimeMillis()
    blockUntilNotRed()

    val rawIndexName = java.util.UUID.randomUUID.toString
    val fakeIndices = FakeIndices(rawIndexName)

    val indexNames = List(
      fakeIndices.getIndex(config, Indices.DataSetsIndex),
      fakeIndices.getIndex(config, Indices.PublishersIndex),
      fakeIndices.getIndex(config, Indices.FormatsIndex)
    )

    val searchQueryer = new ElasticSearchQueryer(fakeIndices)
    val api = new SearchApi(searchQueryer)(config, logger)
    val indexer = new ElasticSearchIndexer(MockClientProvider, fakeIndices)

    val convertedDataSets = dataSets.map( d=>
      d.copy( publisher = d.publisher.map(p =>
            p.copy( acronym = getAcronymFromPublisherName(p.name))
        )
      )
    )

    val stream = Source.fromIterator[DataSet](() => convertedDataSets.iterator)

    indexer.ready.await(INSERTION_WAIT_TIME)

    indexNames.foreach{ idxName =>
      blockUntilIndexExists(idxName)
    }

    indexer.index(stream).await(INSERTION_WAIT_TIME)

    indexNames.foreach{ idxName =>
      refresh(idxName)
    }

    blockUntilExactCount(dataSets.size, indexNames.head)

    totalIndexingTime += (System.currentTimeMillis() - start)
    totalNumOfDatasetIndexes += 1

    (indexNames.head, dataSets, api.routes)
  }
  def encodeForUrl(query: String): String = java.net.URLEncoder.encode(query, "UTF-8")
}

object BaseSearchApiSpec {

}
