package au.csiro.data61.magda.directives

import akka.http.scaladsl.marshalling.ToResponseMarshallable
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.StandardRoute
import scala.concurrent.Future

object RouteDirectives {

  /**
    *  use a separate thread pool for executing blocking tasks to avoid running out routing threads.
    *  Its usage is same as `complete` route directive.
    * @param m
    * @return
    */
  def completeBlockingTask(m: => ToResponseMarshallable): StandardRoute =
    StandardRoute(extractActorSystem.tapply { t =>
      val blockingExeCtx = t._1.dispatchers.lookup("blocking-io-dispatcher")
      complete(Future(m)(blockingExeCtx))
    })

  def completeBlockingTaskIn(
      dispatcherId: String
  )(m: => ToResponseMarshallable): StandardRoute =
    StandardRoute(extractActorSystem.tapply { t =>
      val blockingExeCtx = t._1.dispatchers.lookup(dispatcherId)
      complete(Future(m)(blockingExeCtx))
    })

}
