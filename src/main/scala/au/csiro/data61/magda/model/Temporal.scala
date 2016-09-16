package au.csiro.data61.magda.model

import java.text.ParseException
import java.time._
import java.util.Locale

import scala.util.control.Exception._

import net.time4j.format.expert.ChronoFormatter
import net.time4j.format.expert.Iso8601Format
import net.time4j.format.expert.MultiFormatParser
import net.time4j.format.expert.PatternType

object Periodicity {
  val asNeeded: Periodicity = new Periodicity(text = Some("As Needed"))

  def fromString(string: String) = Periodicity(text = Some(string))
}

case class Periodicity private (text: Option[String] = None, duration: Option[Duration] = None)

case class PeriodOfTime(
  start: Option[ApiInstant] = None,
  end: Option[ApiInstant] = None)

case class ApiInstant(
  date: Option[Instant] = None,
  text: Option[String] = None)

object ApiInstant {
  lazy val ausStyle = ChronoFormatter.ofTimestampPattern("dd/MM/uuuu", PatternType.CLDR, Locale.ENGLISH)
  lazy val multiFormatParser = MultiFormatParser.of(Iso8601Format.BASIC_DATE_TIME, ausStyle);

  def apply(raw: String): ApiInstant = {
    new ApiInstant(
      text = Some(raw),
      date = catching(classOf[ParseException]) opt (multiFormatParser.parse(raw)) map (x => Instant.from(x.toTemporalAccessor()))
    )
  }
}