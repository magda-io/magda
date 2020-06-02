package au.csiro.data61.magda.registry

import scalikejdbc._

case class OrderByDef(field: String, dir: SQLSyntax = SQLSyntax.desc) {
  def parts: Array[String] = field.split("\\.")
  def isAspectPath: Boolean = parts.length > 1
  def aspectName: String = parts.head
  def aspectPathItems: Array[String] = parts.tail
  def aspectPath: String = aspectPathItems.mkString(".")

  private def getFullFieldRef(
      tableName: Option[String],
      columnName: String,
      jsonPathItems: List[String] = Nil
  ) = {
    val columnRef = SQLSyntax.join(
      (tableName.toList ++ List(columnName)).map(SqlHelper.escapeIdentifier(_)),
      sqls".",
      false
    )

    if (jsonPathItems.size > 0) {
      sqls"${columnRef}->${SQLSyntax.join(jsonPathItems.map(item => sqls"${item}"), sqls"->", false)}"
    } else {
      columnRef
    }
  }

  def getSql(
      aspectIdList: List[String] = Nil,
      tableName: Option[String] = None
  ): SQLSyntax = {
    if (!isAspectPath) {
      sqls"${SQLSyntax.orderBy(getFullFieldRef(tableName, field))} ${dir}"
    } else {

      val aspectNameRef = if (aspectIdList.size > 0) {
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

      sqls"${SQLSyntax.orderBy(getFullFieldRef(tableName, aspectNameRef, aspectPathItems.toList))} ${dir}"
    }
  }
}
