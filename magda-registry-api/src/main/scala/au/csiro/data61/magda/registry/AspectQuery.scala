package au.csiro.data61.magda.registry

import java.net.URLDecoder
import scalikejdbc.SQLSyntax

case class AspectQuery(
    aspectId: String,
    path: List[String],
    value: String,
    sqlComparator: SQLSyntax = SQLSyntax.createUnsafely("=")
)

object AspectQuery {

  def parse(string: String): AspectQuery = {
    val Array(path, value) =
      string.split(":").map(URLDecoder.decode(_, "utf-8"))
    val pathParts = path.split("\\.").toList

    if (value.isEmpty) {
      throw new Exception("Value for aspect query is not present.")
    }

    if (pathParts.length < 2) {
      throw new Exception("Path for aspect query was empty")
    }

    AspectQuery(pathParts.head, pathParts.tail, value)
  }
}
