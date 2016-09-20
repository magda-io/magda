package au.csiro.data61.magda.model

import java.text.ParseException
import java.time._
import java.util.Locale

import scala.util.control.Exception._
import java.text.SimpleDateFormat
import java.util.TimeZone
import spray.json._
import au.csiro.data61.magda.model.temporal._

package temporal {
  object Periodicity {
    val asNeeded: Periodicity = new Periodicity(text = Some("As Needed"))

    def fromString(string: String) = Periodicity(text = Some(string))
  }

  case class Periodicity private (text: Option[String] = None, duration: Option[java.time.Duration] = None)

  case class PeriodOfTime(
    start: Option[ApiInstant] = None,
    end: Option[ApiInstant] = None)

  object PeriodOfType {
    val splitters = List("\\s*to\\s*", "\\s*-\\s*")

    def trySplit(raw: String, modified: Instant): Option[PeriodOfTime] =
      splitters
        .view
        .map(raw.split(_))
        .filter(_.length == 2)
        .map(array => PeriodOfTime(ApiInstant.parse(array(0), modified), (ApiInstant.parse(array(1), modified))))
        .filter(x => x.start.map(_.date).isDefined || x.end.map(_.date).isDefined)
        .sortWith { (leftPeriod, rightPeriod) =>
          // Create a list of tuples where _1 is the text option and _2 is the parsed date option
          val options: List[Option[_]] = List(leftPeriod, rightPeriod)
            .flatMap(period => List(period.start, period.end))
            .map(option => option.map(_.date))

          options match {
            // The circumstances in which left is better are if it has a date and right doesn't
            case List(Some(_), None) => true
            case _                   => false
          }
        }.headOption

    def parse(start: Option[String], end: Option[String], modified: Instant) {
      val startInstant = start.flatMap(ApiInstant.parse(_, modified))
      val endInstant = end.flatMap(ApiInstant.parse(_, modified))

      (startInstant.map(_.text), endInstant.map(_.text), startInstant.map(_.date), endInstant.map(_.date)) match {
        // Unparsable text in both start and end - this might mean that there's split values in both (e.g. start=1999-2000, end=2010-2011).
        // In this case we split each and take the earlier value for start and later value for end.
        case (Some(start), Some(end), None, None) => new PeriodOfTime(
          start = trySplit(start, modified).flatMap(_.start),
          end = trySplit(end, modified).flatMap(_.end))
        // We didn't get any dates, so maybe one of the text fields conflates both, e.g. "2015-2016"
        case (Some(start), None, None, None) => trySplit(start, modified)
        case (None, Some(end), None, None)   => trySplit(end, modified)
        case _                               => new PeriodOfTime(startInstant, endInstant)
      }
    }
  }

  sealed trait ApiInstantConstant {
    override def toString() = this.getClass.getSimpleName.split("\\$").last
    def strings: List[String]
  }
  case object Now extends ApiInstantConstant {
    override def strings = List("Current", "Now", "Ongoing")
  }

  case class ApiInstant(
    date: Option[Instant] = None,
    text: String)

  object ApiInstant {
    val constants: List[ApiInstantConstant] = List(Now)
    val constantMap = constants
      .flatMap(constant => constant.strings.flatMap(string => List(string, string.toUpperCase(), string.toLowerCase()).map((constant, _))))
      .map { case (constant, string) => (string, constant) }
      .toMap

    // TODO: push the strings into config.
    val timeFormats = List("HH:mm:ss.SSSXXX", "HH:mm:ss", "HH:mm", "")
    val dateTimeSeparators = List("'T'", "")
    val dateSeparators = List("\\/", "-", " ")
    val dateFormats = List("dd{sep}MM{sep}yyyy", "yyyy{sep}MM{sep}dd", "MM{sep}dd{sep}yyyy", "yyyy")

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

    def parse(raw: String, modified: Instant): Option[ApiInstant] =
      if (raw.isEmpty())
        None
      else
        new Some(ApiInstant(
          text = raw,
          date =
            constantMap.get(raw) match {
              case Some(Now) => Some(modified) // If the date is a constant representation of "Now", assume the temporal coverage is the last modified date.
              case None =>
                formats
                  .view
                  .filter { case (regex, _) => raw.matches(regex) }
                  .map { case (_, format) => catching(classOf[ParseException]) opt (format.parse(raw)) }
                  .filter(_.isDefined)
                  .map(_.get)
                  .headOption
                  .map(_.toInstant())
            }
        ))
  }

  trait Protocols extends DefaultJsonProtocol {
    implicit object InstantFormat extends JsonFormat[Instant] {
      override def write(instant: Instant): JsString = JsString.apply(instant.toString())
      override def read(json: JsValue): Instant = Instant.parse(json.convertTo[String])
    }
    //    implicit object ApiInstantConstant extends JsonFormat[ApiInstantConstant] {
    //      override def write(constant: ApiInstantConstant): JsString = JsString(constant.toString)
    //      override def read(json: JsValue): ApiInstantConstant = {
    //        if (!ApiInstant.constantMap.get(json.convertTo[String]).isDefined) println(json)
    //        ApiInstant.constantMap.get(json.convertTo[String]).get
    //      }
    //    }
    implicit val apiInstant = jsonFormat2(ApiInstant.apply)
    implicit val periodOfTimeFormat = jsonFormat2(PeriodOfTime.apply)
    implicit object DurationFormat extends JsonFormat[Duration] {
      override def write(duration: Duration): JsNumber = JsNumber(duration.toMillis())
      override def read(json: JsValue): Duration = Duration.ofMillis(json.convertTo[Long])
    }
    implicit val periodicityFormat = jsonFormat2(Periodicity.apply)
  }
}