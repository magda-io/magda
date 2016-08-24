package au.csiro.data61.magda.external

import au.csiro.data61.magda.api.Types._
import scala.concurrent.Future

trait ExternalInterface {
  def search(query: String) : Future[Either[String, SearchResult]]
}