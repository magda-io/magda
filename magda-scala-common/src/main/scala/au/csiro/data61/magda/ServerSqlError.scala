package au.csiro.data61.magda

import java.sql.SQLException

class ServerSqlError(val sqlException: SQLException, msg: Option[String] = None)
    extends RuntimeException(msg.getOrElse(sqlException.getMessage())) {

  val constraintViolation =
    if (sqlException.getSQLState.substring(0, 2) == "23") {
      true
    } else {
      false
    }

  def withAltMsg(msg: String) = ServerSqlError(sqlException, Some(msg))
}

object ServerSqlError {

  def apply(e: SQLException, msg: Option[String] = None): ServerSqlError =
    new ServerSqlError(e, msg)
}
