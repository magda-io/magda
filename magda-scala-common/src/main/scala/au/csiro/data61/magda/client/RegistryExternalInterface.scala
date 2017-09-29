package au.csiro.data61.magda.client

import java.io.IOException
import java.time.ZoneOffset

import scala.concurrent.ExecutionContext
import scala.concurrent.Future

import com.typesafe.config.Config

import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.HttpResponse
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import au.csiro.data61.magda.client.HttpFetcher
import au.csiro.data61.magda.model.Registry.Record
import au.csiro.data61.magda.model.Registry.RegistryConverters
import au.csiro.data61.magda.model.Registry.RegistryRecordsResponse
import au.csiro.data61.magda.model.Registry.WebHook
import au.csiro.data61.magda.model.Registry.RegistryConstants
import au.csiro.data61.magda.model.misc.DataSet
import au.csiro.data61.magda.util.Collections.mapCatching
import java.net.URL

class RegistryExternalInterface(httpFetcher: HttpFetcher)(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends RegistryConverters {
  def this()(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    this(HttpFetcher(new URL(config.getString("registry.baseUrl"))))(config, system, executor, materializer)
  }


  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))
  implicit val fetcher = httpFetcher
  implicit val logger = Logging(system, getClass)

  val aspectQueryString = RegistryConstants.aspects.map("aspect=" + _).mkString("&")
  val optionalAspectQueryString = RegistryConstants.optionalAspects.map("optionalAspect=" + _).mkString("&")
  val baseApiPath = "/v0"
  val baseRecordsPath = s"${baseApiPath}/records?$aspectQueryString&$optionalAspectQueryString"

  def onError(response: HttpResponse)(entity: String) = {
    val error = s"Registry request failed with status code ${response.status} and entity $entity"
    logger.error(error)
    Future.failed(new IOException(error))
  }

  def getDataSetsToken(pageToken: String, number: Int): scala.concurrent.Future[(Option[String], List[DataSet])] = {
    fetcher.get(s"${baseRecordsPath}&dereference=true&pageToken=$pageToken&limit=$number").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map { registryResponse =>
          (registryResponse.nextPageToken, mapCatching[Record, DataSet](registryResponse.records,
            { hit => convertRegistryDataSet(hit) },
            { (e, item) => logger.error(e, "Could not parse item: {}", item.toString) }))
        }
        case _ => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def getDataSetsReturnToken(start: Long, number: Int): scala.concurrent.Future[(Option[String], List[DataSet])] = {
    fetcher.get(s"${baseRecordsPath}&dereference=true&start=$start&limit=$number").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map { registryResponse =>
          (registryResponse.nextPageToken, mapCatching[Record, DataSet](registryResponse.records,
            { hit => convertRegistryDataSet(hit) },
            { (e, item) => logger.error(e, "Could not parse item: {}", item.toString) }))
        }
        case _ => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def getTotalDataSetCount(): Future[Long] =
    fetcher.get(s"${baseRecordsPath}&limit=0").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map(_.totalCount)
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }

  def getWebhooks(): Future[List[WebHook]] = {
    fetcher.get(s"${baseApiPath}/hooks").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[List[WebHook]]
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def addWebhook(webhook: WebHook): Future[WebHook] = {
    fetcher.post(s"${baseApiPath}/hooks", webhook).flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[WebHook]
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }
}
