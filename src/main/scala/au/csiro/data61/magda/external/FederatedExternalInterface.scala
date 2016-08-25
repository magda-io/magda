package au.csiro.data61.magda.external

import au.csiro.data61.magda.api.Types._
import scala.concurrent.{ ExecutionContextExecutor, Future }

class FederatedExternalInterface(val interfaces: Seq[ExternalInterface])(implicit val executor: ExecutionContextExecutor) extends ExternalInterface {
  override def search(query: String): Future[Either[String, SearchResult]] = {
    Future.sequence(interfaces.map { interface => interface.search(query) })
      .map(f => f.reduce((either1, either2) => {
        (either1, either2) match {
          case (Right(result1), Right(result2)) => Right(new SearchResult(result1.hitCount + result2.hitCount, result1.dataSets ++ result2.dataSets))
          case (Right(result1), Left(string2))  => Left(string2)
          case (Left(string1), Right(result2))  => Left(string1)
          case (Left(string1), Left(string2))   => Left(string1 + " " + string2)
        }
      }))
  }
}