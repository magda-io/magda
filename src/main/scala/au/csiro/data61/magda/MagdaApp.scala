
package au.csiro.data61.magda

import akka.actor.ActorSystem
import akka.event.{ LoggingAdapter, Logging }
import akka.http.scaladsl.Http
import akka.http.scaladsl.client.RequestBuilding
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.model.{ HttpResponse, HttpRequest }
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.stream.{ ActorMaterializer, Materializer }
import akka.stream.scaladsl.{ Flow, Sink, Source }
import com.typesafe.config.Config
import com.typesafe.config.ConfigFactory
import java.io.IOException
import scala.concurrent.{ ExecutionContextExecutor, Future }
import scala.math._
import spray.json.DefaultJsonProtocol
import au.csiro.data61.magda.api.Api
import akka.actor.{ Actor, DeadLetter, Props }
import au.csiro.data61.magda.crawler.Supervisor
import au.csiro.data61.magda.external.ExternalInterface.ExternalInterfaceType
import au.csiro.data61.magda.crawler.Start
import java.net.URL

object MagdaApp extends App {
  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config = ConfigFactory.load()

  val logger = Logging(system, getClass)

  val api = Api(config, system, executor, materializer)

  val listener = system.actorOf(Props(classOf[Listener]))
  system.eventStream.subscribe(listener, classOf[DeadLetter])

  val supervisor = system.actorOf(Props(new Supervisor(system)))
  supervisor ! Start(ExternalInterfaceType.CKAN, new URL(config.getString("services.dga-api.baseUrl")))
}

class Listener extends Actor {

  def receive = {
    case d: DeadLetter => println(d)
  }
}