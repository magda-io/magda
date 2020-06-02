package au.csiro.data61.magda.registry

import scalikejdbc._

case class OrderByDef(field: String, dir: SQLSyntax = SQLSyntax.desc) {
  def parts: Array[String] = field.split(".")
  def isAspectPath: Boolean = parts.length > 1
  def aspectName: String = parts.head
  def aspectPathItems: Array[String] = parts.tail
  def aspectPath: String = aspectPathItems.mkString(".")

  def getSql(aspectIdList: List[String] = Nil): SQLSyntax = {
    if (!isAspectPath) {
      sqls"${SQLSyntax.orderBy(sqls"${field}")} ${SQLSyntax}"
    } else {
      val pathItems: List[String] = List(
        if (aspectIdList.size > 0) {
          // --- convert aspect
          val idx = aspectIdList.indexOf(aspectName)
          if (idx == -1) {
            throw new Error("Cannot locate the aspect from aspect id list.")
          } else {
            s"aspect${idx}"
          }
        } else {
          aspectName
        }
      ) ++ aspectPathItems

      sqls"${pathItems.take(pathItems.size - 1).mkString("->")}->>${pathItems.last} ${SQLSyntax}"
    }
  }
}
