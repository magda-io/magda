package au.csiro.data61.magda.directives

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{Directive0, _}

object CommonDirectives {

  def withBlockingTask: Directive0 = extractActorSystem.tflatMap { t =>
    val blockingExeCtx = t._1.dispatchers.lookup("blocking-io-dispatcher")
    withExecutionContext(blockingExeCtx)
  }

}
