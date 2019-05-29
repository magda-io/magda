package au.csiro.data61.magda.api

import java.time.OffsetDateTime
import java.time.temporal.{ChronoField, TemporalField}
import java.util.{Calendar, GregorianCalendar}


class DataSetQuerySearchSpecBase extends DataSetSearchSpecBase {

  def queryEquals(outputQuery: Query, inputQuery: Query) = {
      def caseInsensitiveMatchFv(field: String, output: Traversable[FilterValue[String]], input: Traversable[FilterValue[String]]) = withClue(field) {
        output.map(_.map(_.toLowerCase)) should equal(input.map(_.map(_.toLowerCase)))
      }

      outputQuery.freeText.getOrElse("").toLowerCase shouldEqual inputQuery.freeText.getOrElse("").toLowerCase
      caseInsensitiveMatchFv("formats", outputQuery.formats, inputQuery.formats)
      caseInsensitiveMatchFv("publishers", outputQuery.publishers, inputQuery.publishers)
      outputQuery.dateFrom should equal(inputQuery.dateFrom)
      outputQuery.regions.map(_.map(_.copy(regionName = None, boundingBox = None, regionShortName = None))) should equal(inputQuery.regions)

      (outputQuery.dateTo, inputQuery.dateTo) match {
        case (Some(Specified(output)), Some(Specified(input))) =>

          def checkWithRounding(field: TemporalField, maxFunc: OffsetDateTime => Int) = {
            val max = maxFunc(input)

            if (output.get(field) == max) {
              input.get(field) should (equal(0) or equal(max))
            } else {
              input.get(field) should equal(output.get(field))
            }
          }

          def getMax(date: OffsetDateTime, period: Int) = new GregorianCalendar(date.getYear, date.getMonthValue, date.getDayOfMonth).getActualMaximum(period)

          checkWithRounding(ChronoField.MILLI_OF_SECOND, _ => 999)
          checkWithRounding(ChronoField.SECOND_OF_MINUTE, _ => 59)
          checkWithRounding(ChronoField.MINUTE_OF_HOUR, _ => 59)
          checkWithRounding(ChronoField.HOUR_OF_DAY, _ => 23)
          checkWithRounding(ChronoField.DAY_OF_MONTH, date => getMax(date, Calendar.DAY_OF_MONTH))
          checkWithRounding(ChronoField.MONTH_OF_YEAR, date => getMax(date, Calendar.MONTH))
        case (a, b) => a.equals(b)
      }
    }

}
