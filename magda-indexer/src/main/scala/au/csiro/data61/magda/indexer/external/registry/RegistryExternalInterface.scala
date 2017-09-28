package au.csiro.data61.magda.indexer.external.registry

import java.io.IOException
import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import au.csiro.data61.magda.indexer.external.{ InterfaceConfig }
import au.csiro.data61.magda.client.HttpFetcher
import au.csiro.data61.magda.model.misc.DataSet
import com.typesafe.config.Config
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import au.csiro.data61.magda.util.Collections.mapCatching
import au.csiro.data61.magda.model.Registry.{ Record, WebHook }
import au.csiro.data61.magda.indexer.external.registry.{ RegistryIndexerProtocols, RegistryRecordsResponse }
import scala.concurrent.{ ExecutionContext, Future }
import akka.http.scaladsl.model.HttpResponse
import java.time.ZoneOffset

class RegistryExternalInterface(httpFetcher: HttpFetcher, interfaceConfig: InterfaceConfig)(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends RegistryIndexerProtocols with RegistryConverters {
  def this(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    this(HttpFetcher(interfaceConfig.baseUrl), interfaceConfig)(config, system, executor, materializer)
  }

  implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))
  implicit val fetcher = httpFetcher
  implicit val logger = Logging(system, getClass)

  def getInterfaceConfig = interfaceConfig

  val path = if (interfaceConfig.raw.hasPath("path")) interfaceConfig.raw.getString("path") else ""
  val aspectQueryString = RegistryConstants.aspects.map("aspect=" + _).mkString("&")
  val optionalAspectQueryString = RegistryConstants.optionalAspects.map("optionalAspect=" + _).mkString("&")
  val baseUrl = s"${path}records?$aspectQueryString&$optionalAspectQueryString"

  def onError(response: HttpResponse)(entity: String) = {
    val error = s"Registry request failed with status code ${response.status} and entity $entity"
    logger.error(error)
    Future.failed(new IOException(error))
  }

  def getDataSetsToken(pageToken: String, number: Int): scala.concurrent.Future[(Option[String], List[DataSet])] = {
    fetcher.get(s"${baseUrl}&dereference=true&pageToken=$pageToken&limit=$number").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map { registryResponse =>
          (registryResponse.nextPageToken, mapCatching[Record, DataSet](registryResponse.records,
            { hit => registryDataSetConv(interfaceConfig)(hit) },
            { (e, item) => logger.error(e, "Could not parse item for {}: {}", interfaceConfig.name, item.toString) }))
        }
        case _ => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def getDataSetsReturnToken(start: Long, number: Int): scala.concurrent.Future[(Option[String], List[DataSet])] = {
    fetcher.get(s"${baseUrl}&dereference=true&start=$start&limit=$number").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map { registryResponse =>
          (registryResponse.nextPageToken, mapCatching[Record, DataSet](registryResponse.records,
            { hit => registryDataSetConv(interfaceConfig)(hit) },
            { (e, item) => logger.error(e, "Could not parse item for {}: {}", interfaceConfig.name, item.toString) }))
        }
        case _ => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def getTotalDataSetCount(): Future[Long] =
    fetcher.get(s"${baseUrl}&limit=0").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[RegistryRecordsResponse].map(_.totalCount)
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }

  def getWebhooks(): Future[List[WebHook]] = {
    fetcher.get(s"${path}hooks").flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[List[WebHook]]
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }

  def addWebhook(webhook: WebHook): Future[WebHook] = {
    fetcher.post(s"${path}hooks", webhook).flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[WebHook]
        case _  => Unmarshal(response.entity).to[String].flatMap(onError(response))
      }
    }
  }
}
