package au.csiro.data61.magda.util

import java.time.OffsetDateTime

import akka.event.LoggingAdapter
import au.csiro.data61.magda.util.DateParser._

import scala.xml.NodeSeq

object Xml {
  implicit def nodeToOption[T](node: NodeSeq, toValue: NodeSeq => Option[T]): Option[T] =
    if (node.size == 0) None else toValue(node)

  def nodeToNodeOption(node: NodeSeq): Option[NodeSeq] = nodeToOption(node, nodeSeq => Some.apply(nodeSeq))

  def nodeToStringOption(node: NodeSeq): Option[String] = nodeToOption(node, x => if (x.text.isEmpty()) None else Some(x.text))

  def parseDateFromNode(node: NodeSeq)(implicit logger: LoggingAdapter): Option[OffsetDateTime] =
    nodeToStringOption(node).flatMap(parseDateDefault(_, false))

  def nodesWithAttribute(sourceNodes: NodeSeq, name: String, value: String): NodeSeq = {
    sourceNodes
      .filter(node =>
        node.attribute(name)
          .map(
            _.exists { x =>
              x.text.trim.equals(value)
            }
          )
          .getOrElse(false))
  }

  def nodesToMap(sourceNode: NodeSeq, fields: String*): Map[String, String] = {
    fields.foldRight(Map[String, String]())((field, map) =>
      map + (field -> (sourceNode \ field).text.trim)
    )
  }
}