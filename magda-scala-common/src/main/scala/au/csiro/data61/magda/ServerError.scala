package au.csiro.data61.magda

import akka.http.scaladsl.model.StatusCode

case class ServerError(msg: String, statusCode: StatusCode)
    extends Exception(s"Error ${statusCode}: ${msg}")
