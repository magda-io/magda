package au.csiro.data61.magda.indexer.external.csw

import java.io.IOException
import au.csiro.data61.magda.util.RichConfig.RichConfig
import scala.concurrent.Future
import scala.xml.NodeSeq
import akka.actor.ActorSystem
import akka.event.Logging
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshallers.xml.ScalaXmlSupport
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.Materializer
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Temporal._
import au.csiro.data61.magda.model.misc._
import au.csiro.data61.magda.util.DateParser._
import com.monsanto.labs.mwundo.GeoJson.Coordinate
import com.monsanto.labs.mwundo.GeoJson.Polygon
import com.monsanto.labs.mwundo.GeoJson.MultiPolygon
import com.monsanto.labs.mwundo.GeoJson.Point
import com.monsanto.labs.mwundo.GeoJson.MultiPoint
import scala.xml.Node
import au.csiro.data61.magda.indexer.external.ExternalInterface
import au.csiro.data61.magda.indexer.external.HttpFetcher
import au.csiro.data61.magda.indexer.external.InterfaceConfig
import scala.BigDecimal
import com.typesafe.config.Config

trait CSWImplementation {
  def typeName: String
  def schema: String
  def responseConv(res: NodeSeq): List[DataSet]
}

object CSWExternalInterface {
  def apply(interfaceConfig: InterfaceConfig)(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    val implementation = interfaceConfig.raw.getOptionalString("schema") match {
      case Some("http://www.isotc211.org/2005/gmd") => new GMDCSWImplementation(interfaceConfig, config, system)
      case _                                        => new DefaultCSWImplementation(interfaceConfig, config, system)
    }

    new CSWExternalInterface(interfaceConfig, implementation, system, executor, materializer)
  }
}

class CSWExternalInterface(interfaceConfig: InterfaceConfig, implementation: CSWImplementation, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends ExternalInterface with ScalaXmlSupport {
  val logger = Logging(system, getClass)
  implicit val fetcher = new HttpFetcher(interfaceConfig, system, materializer, executor)

  override def getInterfaceConfig = interfaceConfig

  def getDataSets(start: Long = 0, number: Int = 10): Future[List[DataSet]] = {
    val query = s"""csw?service=CSW&version=2.0.2&request=GetRecords&constraintlanguage=FILTER&resultType=results&elementsetname=full&outputschema=${implementation.schema}&typeNames=${implementation.typeName}&startPosition=${start + 1}&maxRecords=$number""";

    fetcher.request(query).flatMap { response =>
      response.status match {
        case OK => Unmarshal(response.entity).to[NodeSeq].map(implementation.responseConv(_))
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val error = s"CSW request failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
  }

  def getTotalDataSetCount(): Future[Long] = {
    val query = s"""csw?service=CSW&version=2.0.2&request=GetRecords&constraintlanguage=FILTER&typeNames=${implementation.typeName}&maxRecords=1""";

    fetcher.request(query).flatMap { response =>
      response.status match {
        case OK =>
          val future = Unmarshal(response.entity).to[NodeSeq]

          future.map(res =>
            try {
              (res \ "SearchResults" \@ "numberOfRecordsMatched").toLong
            } catch {
              case e: Throwable =>
                logger.error("Failed to parse data set count for {}", res.toString())
                throw e
            }
          )
        case _ => Unmarshal(response.entity).to[String].flatMap { entity =>
          val error = s"CSW request failed with status code ${response.status} and entity $entity"
          logger.error(error)
          Future.failed(new IOException(error))
        }
      }
    }
  }
}