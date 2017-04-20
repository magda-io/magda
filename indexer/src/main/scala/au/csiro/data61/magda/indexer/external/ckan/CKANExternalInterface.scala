package au.csiro.data61.magda.indexer.external.ckan

import java.io.IOException
import java.net.URL

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future
import scala.collection.JavaConversions._

import com.typesafe.config.Config

import akka.actor.ActorSystem
import akka.event.Logging
import akka.event.LoggingAdapter
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import akka.stream.scaladsl.Flow
import akka.stream.scaladsl.Sink
import akka.stream.scaladsl.Source
import au.csiro.data61.magda.model.Temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.indexer.external.ckan._
import au.csiro.data61.magda.model.misc.Protocols._
import scala.util.{ Success, Failure }
import scala.concurrent.Await
import scala.concurrent.duration._
import java.net.URLEncoder
import au.csiro.data61.magda.indexer.external.HttpFetcher
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import au.csiro.data61.magda.indexer.external.ExternalInterface
import au.csiro.data61.magda.util.Collections.mapCatching
import java.time.ZoneOffset

class CKANExternalInterface(interfaceConfig: InterfaceConfig, implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface with CKANConverters {
  implicit val logger = Logging(system, getClass)
  implicit val fetcher = new HttpFetcher(interfaceConfig, system, materializer, executor)
  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))

  override def getInterfaceConfig = interfaceConfig

  val exclusionQueryString = {
    val excludedHarvesterTitles = interfaceConfig.raw.hasPath("ignoreHarvestSources") match {
      case true  => interfaceConfig.raw.getStringList("ignoreHarvestSources").toSet
      case false => Set()
    }

    val solrQueries = excludedHarvesterTitles.map(title => s"-harvest_source_title:${URLEncoder.encode('"' + title + '"', "UTF-8")}")

    if (solrQueries.isEmpty) None else Some(solrQueries.reduce(_ + "+" + _))
  }
  val baseUrl = s"api/3/action/package_search?${exclusionQueryString.map(q => s"fq=${q}").getOrElse("")}&sort=metadata_created%20asc"

  override def getDataSets(start: Long, number: Int): scala.concurrent.Future[List[DataSet]] =
    fetcher.request(s"$baseUrl&start=$start&rows=$number").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[CKANSearchResponse].map { ckanDataSet =>
          mapCatching[CKANDataSet, DataSet](ckanDataSet.result.results,
            { hit => ckanDataSetConv(interfaceConfig)(hit) },
            { (e, item) => logger.error(e, "Could not parse item for {}: {}", interfaceConfig.name, item.toString) }
          )
        }
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val url = s"${interfaceConfig.baseUrl}$baseUrl&start=$start&rows=$number"
          val error = s"CKAN request for $url failed with status code ${response.status} and entity $entity"
          Future.failed(new IOException(error))
        }
      }
    }

  override def getTotalDataSetCount(): scala.concurrent.Future[Long] =
    fetcher.request(s"$baseUrl&rows=0").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.count)
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val url = s"${interfaceConfig.baseUrl}$baseUrl&rows=0"
          val error = s"CKAN request for $url failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
}