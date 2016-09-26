package au.csiro.data61.magda.util

import scala.util.control.Exception._
import java.text.ParseException
import java.time._
import java.util.Locale
import java.text.SimpleDateFormat
import java.util.TimeZone

object DateParser {

  sealed trait DateConstant {
    override def toString() = this.getClass.getSimpleName.split("\\$").last
    def strings: List[String]
  }
  case object Now extends DateConstant {
    override def strings = List("Current", "Now", "Ongoing")
  }

  private val constants: List[DateConstant] = List(Now)
  private val constantMap = constants
    .flatMap(constant => constant.strings.flatMap(string => List(string, string.toUpperCase(), string.toLowerCase()).map((constant, _))))
    .map { case (constant, string) => (string, constant) }
    .toMap

  // TODO: push the strings into config.
  private val timeFormats = List("HH:mm:ss.SSSXXX", "HH:mm:ss", "HH:mm", "")
  private val dateTimeSeparators = List("'T'", "")
  private val dateSeparators = List("\\/", "-", " ")
  private val dateFormats = List("dd{sep}MM{sep}yyyy", "yyyy{sep}MM{sep}dd", "MM{sep}dd{sep}yyyy", "MMMMM{sep}yyyy", "MMMMM{sep}yy", "yyyy", "yy")

  private val formats = for {
    timeFormat <- timeFormats
    dateTimeSeparator <- dateTimeSeparators
    dateSeparator <- dateSeparators
    dateFormat <- dateFormats
  } yield {
    val fullFormat: String = s"${dateFormat}${dateTimeSeparator}${timeFormat}"
    val replacedDateFormat = fullFormat.replace("{sep}", dateSeparator)
    val regex = replacedDateFormat
      .replaceAll("[E|M]{5}", "[A-Za-z]+")
      .replaceAll("[E|M]{3}", "[A-Za-z]{3}")
      .replaceAll("[H|m|s|S|X|d|M|y]", "\\\\d")
      .r
    val javaFormat = new SimpleDateFormat(replacedDateFormat);

    (regex, javaFormat)
  }
  
  sealed trait ParseResult
  case class InstantResult(instant: Instant) extends ParseResult
  case class ConstantResult(dateConstant: DateConstant) extends ParseResult
  case object ParseFailure extends ParseResult

  def parseDate(raw: String): ParseResult =
    if (raw.isEmpty())
      ParseFailure
    else
      constantMap.get(raw) match {
        case Some(constant) => ConstantResult(constant) // If the date is a constant representation of "Now", assume the temporal coverage is the last modified date.
        case None =>
          formats
            .view
            .filter { case (regex, _) => regex.findFirstIn(raw).isDefined }
            .map { case (_, format) => catching(classOf[ParseException]) opt (format.parse(raw)) }
            .filter(_.isDefined)
            .map(_.get)
            .headOption
            .map(date => InstantResult(date.toInstant()))
            .getOrElse(ParseFailure)
      }
}