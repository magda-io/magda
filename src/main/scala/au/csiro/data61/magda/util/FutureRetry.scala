package au.csiro.data61.magda.util

import scala.concurrent.duration._
import scala.concurrent.ExecutionContext
import scala.concurrent.Future
import akka.actor.Scheduler
import akka.pattern.after

object FutureRetry {
  /**
   * Given an operation that produces a T, returns a Future containing the result of T, unless an exception is thrown,
   * in which case the operation will be retried after _delay_ time, if there are more possible retries, which is configured through
   * the _retries_ parameter. If the operation does not succeed and there is no retries left, the resulting Future will contain the last failure.
   */
  def retry[T](op: Future[T], delay: FiniteDuration, retries: Int, onRetry: Int => Unit = _ => {})(implicit ec: ExecutionContext, s: Scheduler): Future[T] =
    op recoverWith {
      case _ if retries > 0 => after(delay, s)({
        onRetry(retries - 1)
        retry(op, delay, retries - 1, onRetry)
      })
    }
}