package au.csiro.data61.magda.model

import java.text.ParseException
import java.time._
import java.util.Locale

import scala.util.control.Exception._
import java.text.SimpleDateFormat
import java.util.TimeZone

package temporal {
  object Periodicity {
    val asNeeded: Periodicity = new Periodicity(text = Some("As Needed"))

    def fromString(string: String) = Periodicity(text = Some(string))
  }

  case class Periodicity private (text: Option[String] = None, duration: Option[java.time.Duration] = None)

  case class PeriodOfTime(
    start: Option[ApiInstant] = None,
    end: Option[ApiInstant] = None)

  case class ApiInstant(
    date: Option[Instant] = None,
    text: Option[String] = None,
    constant: Option[ApiInstantConstant] = None)

  sealed trait ApiInstantConstant {
    override def toString() = this.getClass.toString()
    def strings : List[String]
  }
  case object Now extends ApiInstantConstant {
    override def strings = List("Current", "Now")
  }

  object ApiInstant {
    val constants : List[ApiInstantConstant] = List(Now)
    val constantMap = constants
      .flatMap(constant => constant.strings.map((constant, _)))
      .map { case (constant, string) => (string, constant) }
      .toMap      
      
    // TODO: push the strings into config.
    val timeFormats = List("HH:mm:ss.SSSXXX", "HH:mm:ss", "HH:mm", "")
    val dateTimeSeparators = List("'T'", "")
    val dateSeparators = List("\\/", "-", " ")
    val dateFormats = List("dd{sep}MM{sep}yyyy", "yyyy{sep}MM{sep}dd", "MM{sep}dd{sep}yyyy")

    val formats = for {
      timeFormat <- timeFormats
      dateTimeSeparator <- dateTimeSeparators
      dateSeparator <- dateSeparators
      dateFormat <- dateFormats
    } yield {
      val fullFormat: String = s"${dateFormat}${dateTimeSeparator}${timeFormat}"
      val replacedDateFormat = fullFormat.replace("{sep}", dateSeparator)
      val regex = replacedDateFormat.replaceAll("[H|m|s|S|X|d|M|y]", "\\\\d")
      val javaFormat = new SimpleDateFormat(replacedDateFormat);
      javaFormat.setTimeZone(TimeZone.getTimeZone("Australia/Sydney"))

      (regex, javaFormat)
    }

    def apply(raw: String): ApiInstant = {
      if (raw.isEmpty())
        new ApiInstant
      else
        new ApiInstant(
          text = Some(raw),
          date = {
            formats
              .view
              .filter { case (regex, _) => raw.matches(regex) }
              .map { case (_, format) => catching(classOf[ParseException]) opt (format.parse(raw)) }
              .filter(_.isDefined)
              .map(_.get)
              .headOption
              .map(_.toInstant())
          }
        )
    }
  }
}