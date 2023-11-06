package au.csiro.data61.magda.directives

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{Directive0, _}
import scala.concurrent.Future

object CommonDirectives {

  def onCompleteBlockingTask: Directive0 = extractActorSystem.tflatMap { t =>
    Directive { inner => ctx =>
      val blockingExeCtx = t._1.dispatchers.lookup("blocking-io-dispatcher")
      Future { inner() }(blockingExeCtx).flatMap(_(ctx))(blockingExeCtx)
    }
  }

  def onCompleteBlockingTaskIn(dispatcherId: String): Directive0 =
    extractActorSystem.tflatMap { t =>
      Directive { inner => ctx =>
        val blockingExeCtx = t._1.dispatchers.lookup(dispatcherId)
        Future { inner() }(blockingExeCtx).flatMap(_(ctx))(blockingExeCtx)
      }
    }

}
