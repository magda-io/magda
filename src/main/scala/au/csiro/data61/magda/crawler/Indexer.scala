package au.csiro.data61.magda.crawler

import java.net.URL

import akka.actor.{ Actor, ActorRef }
import au.csiro.data61.magda.api.Types._
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * @author Foat Akhmadeev
 *         17/01/16
 */
class Indexer(supervisor: ActorRef) extends Actor {
  var allDatasets: List[DataSet] = List()

  def receive: Receive = {
    case Index(baseUrl, dataSets) =>
      allDatasets ++= dataSets

      // TODO: Put into ES or similar here

      supervisor ! IndexFinished(dataSets, baseUrl)
    case Search(query) =>
      sender ! allDatasets.filter { x =>
        x.title match {
          case Some(title) => title.contains(query)
          case None        => false
        }
      }
    case SearchFacets(facetName, query) =>
      sender ! allDatasets
        .map { dataSet =>
          facetName match {
            case "publisher" => dataSet.publisher.flatMap(_.name)
            case "year"      => dataSet.issued.map(LocalDateTime.ofInstant(_, ZoneId.systemDefault()).getYear.toString)
          }
        }
        .filter {
          case Some(facetValue) => facetValue.contains(query)
          case None             => false
        }
        .map(_.get)
        .toSet
        .toList
  }

  @throws[Exception](classOf[Exception])
  override def postStop(): Unit = {
    super.postStop()
    //    store.foreach(println)
    //    println(store.size)
  }
}