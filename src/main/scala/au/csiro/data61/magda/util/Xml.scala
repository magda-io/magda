package au.csiro.data61.magda.util

import scala.xml.NodeSeq
import java.time.Instant
import au.csiro.data61.magda.util.DateParser._
import akka.event.LoggingAdapter

object Xml {
  implicit def nodeToOption[T](node: NodeSeq, toValue: NodeSeq => Option[T] = (node: NodeSeq) => Some.apply(node)): Option[T] =
    if (node.size == 0) None else toValue(node)

  def nodeToStringOption(node: NodeSeq): Option[String] = nodeToOption(node, x => if (x.text.isEmpty()) None else Some(x.text))

  def parseDateFromNode(node: NodeSeq)(implicit logger: LoggingAdapter): Option[Instant] =
    nodeToStringOption(node).flatMap(parseDate(_, false) match {
      case InstantResult(instant) => Some(instant)
      case ConstantResult(constant) => constant match {
        case Now => Some(Instant.now())
      }
      case ParseFailure =>
        logger.debug("Parse failure for {}", node text)
        None
    })

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