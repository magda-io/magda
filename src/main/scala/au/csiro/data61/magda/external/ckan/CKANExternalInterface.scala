package au.csiro.data61.magda.external

import java.io.IOException
import java.net.URL

import scala.concurrent.ExecutionContext
import scala.concurrent.ExecutionContextExecutor
import scala.concurrent.Future

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
import au.csiro.data61.magda.model.temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.external.ckan._
import au.csiro.data61.magda.model.misc.Protocols._
import scala.util.{ Success, Failure }
import scala.concurrent.Await
import scala.concurrent.duration._

class CKANExternalInterface(interfaceConfig: InterfaceConfig, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends CKANProtocols with ExternalInterface with CKANConverters {
  implicit val logger = Logging(system, getClass)
  implicit val fetcher = new HttpFetcher(interfaceConfig, system, materializer, executor)

  override def getDataSets(start: Long, number: Int): scala.concurrent.Future[List[DataSet]] = fetcher.request(s"action/package_search?start=$start&rows=$number").flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.results)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        Future.failed(new IOException(error))
      }
    }
  }

  override def getTotalDataSetCount(): scala.concurrent.Future[Long] = fetcher.request(s"action/package_search?rows=0").flatMap { response =>
    response.status match {
      case OK => Unmarshal(response.entity).to[CKANSearchResponse].map(_.result.count)
      case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
        val error = s"CKAN request failed with status code ${response.status} and entity $entity"
        logger.error(error)
        Future.failed(new IOException(error))
      }
    }
  }
}