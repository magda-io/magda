package au.csiro.data61.magda.model

import akka.actor.ActorSystem
import org.scalatest.{FunSpec, Matchers}
import au.csiro.data61.magda.util.StringUtils._
import scalikejdbc.interpolation.SQLSyntax
import io.lemonlabs.uri.{QueryString}

class AspectQuerySpec extends FunSpec with Matchers {

  implicit val system = ActorSystem()
  val logger = akka.event.Logging.getLogger(system, getClass)

  describe("AspectQueryTrue") {
    it("should produce correct sql query") {
      val aq = new AspectQueryTrue
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value shouldBe "TRUE"
    }
  }

  describe("AspectQueryFalse") {
    it("should produce correct sql query") {
      val aq = new AspectQueryFalse
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value shouldBe "FALSE"
    }
  }

  describe("AspectQueryExists") {
    it("should produce correct sql query") {
      val aq = AspectQueryExists("testAspect", List("fieldA", "fieldB"))
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB")
    }

    it("should produce correct sql query when negated = true") {
      val aq = AspectQueryExists("testAspect", List("fieldA", "fieldB"), true)
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ not exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB")
    }

    /**
      * The SQL generated tests the existence of `recordaspect` record actually for this case
      */
    it("should produce correct sql query when path is Nil") {
      val aq = AspectQueryExists("testAspect", Nil)
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid"))""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect")
    }

  }

  describe("AspectQueryWithValue with non-Nil path") {
    it(
      "should produce correct sql query with string value and default `=` operator"
    ) {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        value = AspectQueryStringValue("xxsdweewe2")
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE((data #>> string_to_array(?, ','))::TEXT = ?::TEXT, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List(
        "testAspect",
        "fieldA,fieldB",
        "xxsdweewe2"
      )
    }

    it(
      "should produce correct sql query with string value and `NOT LIKE` operator"
    ) {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        operator = SQLSyntax.createUnsafely("NOT LIKE"),
        value = AspectQueryStringValue("xxsdweewe2")
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE((data #>> string_to_array(?, ','))::TEXT NOT LIKE ?::TEXT, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List(
        "testAspect",
        "fieldA,fieldB",
        "xxsdweewe2"
      )
    }

    it(
      "should produce correct sql query with bool value and default `=` operator"
    ) {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        value = AspectQueryStringValue("test string"),
        negated = true
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ not exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE((data #>> string_to_array(?, ','))::TEXT = ?::TEXT, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List(
        "testAspect",
        "fieldA,fieldB",
        "test string"
      )
    }

    it(
      "should produce correct sql query with bool value and default `=` operator & negated = true"
    ) {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        value = AspectQueryBooleanValue(true),
        negated = true
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ not exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE((data #>> string_to_array(?, ','))::BOOL = ?::BOOL, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB", true)
    }

    it("should produce correct sql query with numeric value and `>` operator") {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        operator = SQLSyntax.createUnsafely(">"),
        value = AspectQueryBigDecimalValue(1.57)
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE((data #>> string_to_array(?, ','))::NUMERIC > ?::NUMERIC, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB", 1.57)
    }

    it(
      "should produce correct sql query with numeric value, `<=` operator and `placeReferenceFirst` = false"
    ) {
      val aq = AspectQueryWithValue(
        "testAspect",
        List("fieldA", "fieldB"),
        operator = SQLSyntax.createUnsafely("<="),
        value = AspectQueryBigDecimalValue(1.57),
        placeReferenceFirst = false
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |             COALESCE(?::NUMERIC <= (data #>> string_to_array(?, ','))::NUMERIC, false)
                                                          |          )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", 1.57, "fieldA,fieldB")
    }

  }

  /**
    * When path is nil, we assume the aspectId is one of the record property in order to support query like object.record.id="xxxxx"
    * We only support a pre-selected list of record properties (record table column) -- see implementation for details.
    */
  describe("AspectQueryWithValue with Nil path") {
    it(
      "should query against `recordid` column and convert value as TEXT with aspectId = `recordid` & number value"
    ) {
      val aq = AspectQueryWithValue(
        "recordid",
        Nil,
        value = AspectQueryBigDecimalValue(213233222)
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces.trim shouldBe " exists (SELECT 1 FROM records where (recordid, tenantid)=(\"records\".\"recordid\", \"records\".\"tenantid\") and COALESCE(recordid::TEXT = ?::TEXT, FALSE))".stripMargin.stripLineEndingWhitespaces.trim
      sql.get.parameters shouldBe List(213233222)
    }

    it(
      "should query against `recordid` column as well and convert value as TEXT with aspectId = `id` & string value"
    ) {
      val aq = AspectQueryWithValue(
        "id",
        Nil,
        value = AspectQueryStringValue("sds-dsd-233222")
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces.trim shouldBe " exists (SELECT 1 FROM records where (recordid, tenantid)=(\"records\".\"recordid\", \"records\".\"tenantid\") and COALESCE(recordid::TEXT = ?::TEXT, FALSE))".stripMargin.stripLineEndingWhitespaces.trim
      sql.get.parameters shouldBe List("sds-dsd-233222")
    }

    it(
      "should query against `lastupdate` column with aspectId = `lastUpdate` & string value"
    ) {
      val aq = AspectQueryWithValue(
        // different case should be convert to lowercase `lastupdate`
        "lastUpdate",
        Nil,
        // String value will be converted to numeric
        value = AspectQueryStringValue("23432879")
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces.trim shouldBe " exists (SELECT 1 FROM records where (recordid, tenantid)=(\"records\".\"recordid\", \"records\".\"tenantid\") and COALESCE(lastupdate::NUMERIC = ?::NUMERIC, FALSE))".stripMargin.stripLineEndingWhitespaces.trim
      sql.get.parameters shouldBe List("23432879")
    }

    it(
      "should query against `lastupdate` column with aspectId = `lastupdate` & numeric value"
    ) {
      val aq = AspectQueryWithValue(
        "lastupdate", // lowercase also work
        Nil,
        value = AspectQueryBigDecimalValue(23432879) // numeric type also work
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces.trim shouldBe " exists (SELECT 1 FROM records where (recordid, tenantid)=(\"records\".\"recordid\", \"records\".\"tenantid\") and COALESCE(lastupdate::NUMERIC = ?::NUMERIC, FALSE))".stripMargin.stripLineEndingWhitespaces.trim
      sql.get.parameters shouldBe List(23432879)
    }

    it(
      "should throw an error when query against `lastupdate` column with aspectId = `lastUpdate` & bool value"
    ) {
      val aq = AspectQueryWithValue(
        // different case should be convert to lowercase `lastupdate`
        "lastUpdate",
        Nil,
        value = AspectQueryBooleanValue(true)
      )
      val thrown = the[Error] thrownBy aq.toSql()
      thrown.getMessage shouldBe ("Failed to convert `AspectQueryWithValue` into record property query (aspectId = `lastUpdate`): cannot convert bool value to numeric value.")
    }

    it(
      "should throw an error when query with an not exist record property name"
    ) {
      val aq = AspectQueryWithValue(
        "aNonExistRecordPropertyName",
        Nil,
        value = AspectQueryStringValue("xxxxxweews")
      )
      val thrown = the[Error] thrownBy aq.toSql()
      thrown.getMessage shouldBe ("Invalid AspectQueryWithValue: aNonExistRecordPropertyName is not valid or supported record property / aspect name.")
    }

    it(
      "should query against `tenantid` column and convert value as TEXT with aspectId = `tenantId`, negated = true & number value"
    ) {
      val aq = AspectQueryWithValue(
        "tenantId", // will be converted to lowercase in SQL
        Nil,
        negated = true,
        // all id meaning column we always treat as text
        value = AspectQueryBigDecimalValue(213233222)
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces.trim shouldBe " not exists (SELECT 1 FROM records where (recordid, tenantid)=(\"records\".\"recordid\", \"records\".\"tenantid\") and COALESCE(tenantid::TEXT = ?::TEXT, FALSE))".stripMargin.stripLineEndingWhitespaces.trim
      sql.get.parameters shouldBe List(213233222)
    }

  }

  describe("AspectQueryArrayNotEmpty") {
    it("should produce correct sql query") {
      val aq = AspectQueryArrayNotEmpty("testAspect", List("fieldA", "fieldB"))
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      // we attempt to retrieve the first element and test whether it is NULL
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB,0")
    }

    it("should produce correct sql query when negated = true") {
      val aq =
        AspectQueryArrayNotEmpty("testAspect", List("fieldA", "fieldB"), true)
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ not exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB,0")
    }

    it("should throw an error when path is Nil") {
      val aq = AspectQueryArrayNotEmpty("testAspect", Nil)
      val thrown = the[Error] thrownBy aq.toSql()
      thrown.getMessage shouldBe ("Invalid AspectQueryArrayNotEmpty for aspectId `testAspect` path cannot be empty.")
    }

  }

  describe("AspectQueryValueInArray") {
    it("should produce correct sql query") {
      val aq = AspectQueryValueInArray(
        "testAspect",
        List("fieldA", "fieldB"),
        value = AspectQueryBigDecimalValue(1.56)
      )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           COALESCE(
                                                          |              (
                                                          |                (data::JSONB #> string_to_array(?, ','))::JSONB
                                                          |              ) @> ?::TEXT::JSONB,
                                                          |              FALSE
                                                          |            )
                                                          |        )
                                                          |""".stripMargin.stripLineEndingWhitespaces
      // we attempt to retrieve the first element and test whether it is NULL
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB", 1.56)
    }

    it("should produce correct sql query when negated = true") {
      val aq =
        AspectQueryValueInArray(
          "testAspect",
          List("fieldA", "fieldB"),
          value = AspectQueryBooleanValue(true),
          true
        )
      val sql = aq.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ not exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           COALESCE(
                                                          |              (
                                                          |                (data::JSONB #> string_to_array(?, ','))::JSONB
                                                          |              ) @> ?::TEXT::JSONB,
                                                          |              FALSE
                                                          |            )
                                                          |        )
                                                          |""".stripMargin.stripLineEndingWhitespaces
      sql.get.parameters shouldBe List("testAspect", "fieldA,fieldB", true)
    }

    it("should throw an error when path is Nil") {
      val aq = AspectQueryValueInArray(
        "testAspect",
        Nil,
        AspectQueryStringValue("sdsdds")
      )
      val thrown = the[Error] thrownBy aq.toSql()
      thrown.getMessage shouldBe ("Invalid AspectQueryValueInArray for aspectId `testAspect` path cannot be empty.")
    }

  }

  describe("AspectQueryGroup") {
    it(
      "should by default produce sql and join aspect query together with `and`"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        )
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           COALESCE(
                                                          |              (
                                                          |                (data::JSONB #> string_to_array(?, ','))::JSONB
                                                          |              ) @> ?::TEXT::JSONB,
                                                          |              FALSE
                                                          |            )
                                                          |        ) and  exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      // we attempt to retrieve the first element and test whether it is NULL
      sql.get.parameters shouldBe List(
        "testaspect1",
        "field1,field2",
        "sssss",
        "testaspect2",
        "field3,field4"
      )
    }

    it(
      "should join aspect query together with `OR` with set `joinWithAnd` = false"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        ),
        joinWithAnd = false
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """ exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           COALESCE(
                                                          |              (
                                                          |                (data::JSONB #> string_to_array(?, ','))::JSONB
                                                          |              ) @> ?::TEXT::JSONB,
                                                          |              FALSE
                                                          |            )
                                                          |        ) or  exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        )""".stripMargin.stripLineEndingWhitespaces
      // we attempt to retrieve the first element and test whether it is NULL
      sql.get.parameters shouldBe List(
        "testaspect1",
        "field1,field2",
        "sssss",
        "testaspect2",
        "field3,field4"
      )
    }

    it(
      "should skip other aspect queries when contains a AspectQueryFalse (joinWithAnd = true i.e. AND)"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          new AspectQueryFalse,
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        ),
        joinWithAnd = true
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe "FALSE"
      sql.get.parameters shouldBe Nil
    }

    it(
      "should skip other aspect queries when contains a AspectQueryTrue (joinWithAnd = false i.e. OR)"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          new AspectQueryTrue,
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        ),
        joinWithAnd = false
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe "TRUE"
      sql.get.parameters shouldBe Nil
    }

    it(
      "should produce correct SQL when negated = true"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        ),
        negated = true
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe """NOT ( exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           COALESCE(
                                                          |              (
                                                          |                (data::JSONB #> string_to_array(?, ','))::JSONB
                                                          |              ) @> ?::TEXT::JSONB,
                                                          |              FALSE
                                                          |            )
                                                          |        ) and  exists (SELECT 1 FROM recordaspects where (aspectid, recordid, tenantid)=(?, "records"."recordid", "records"."tenantid") and
                                                          |           (data #> string_to_array(?, ',')) IS NOT NULL
                                                          |        ))""".stripMargin.stripLineEndingWhitespaces
      // we attempt to retrieve the first element and test whether it is NULL
      sql.get.parameters shouldBe List(
        "testaspect1",
        "field1,field2",
        "sssss",
        "testaspect2",
        "field3,field4"
      )
    }

    it(
      "should skip other aspect queries when contains a AspectQueryTrue (joinWithAnd = false i.e. OR) and produce correct SQL when negated = true"
    ) {
      val qs = AspectQueryGroup(
        queries = Seq(
          AspectQueryValueInArray(
            "testaspect1",
            Seq("field1", "field2"),
            value = AspectQueryStringValue("sssss")
          ),
          new AspectQueryTrue,
          AspectQueryExists("testaspect2", Seq("field3", "field4"))
        ),
        joinWithAnd = false,
        negated = true
      )
      val sql = qs.toSql()
      sql.isDefined shouldBe true
      sql.get.value.stripLineEndingWhitespaces shouldBe "NOT (TRUE)"
      sql.get.parameters shouldBe Nil
    }

  }

  describe("AspectQuery.parse (parse registry API query string aspect query)") {
    def testAspectQueryString(
        queryString: String,
        verify: (AspectQuery => Unit)
    ) = {
      it(
        s"should parse query string `${queryString}` into aspectQuery correctly"
      ) {
        val qs = QueryString.parse(queryString)
        qs.param("aspectQuery").map(AspectQuery.parse(_)).map(verify(_))
        qs.param("aspectQuery").isDefined shouldBe true
      }
    }

    testAspectQueryString(
      "aspectQuery=order.account.id:clientA%253Aorder%253A1234",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "order"
            path.mkString(".") shouldBe "account.id"
            value shouldBe AspectQueryStringValue("clientA:order:1234")
            operator.value shouldBe "="
            negated shouldBe false
            placeReferenceFirst shouldBe true
        }
    )

    testAspectQueryString(
      "aspectQuery=dcat-dataset-strings.title:?%2525rating%2525",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "dcat-dataset-strings"
            path.mkString(".") shouldBe "title"
            value shouldBe AspectQueryStringValue("%rating%") // searching any string contains ratings keywords
            operator.value shouldBe "ILIKE"
            negated shouldBe false
            placeReferenceFirst shouldBe true
        }
    )

    testAspectQueryString(
      "aspectQuery=testAspect.field1:!value1",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "testAspect"
            path.mkString(".") shouldBe "field1"
            value shouldBe AspectQueryStringValue("value1")
            operator.value shouldBe "="
            negated shouldBe true
            placeReferenceFirst shouldBe true
        }
    )

    testAspectQueryString(
      "aspectQuery=testAspect2.field2:!?value2",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "testAspect2"
            path.mkString(".") shouldBe "field2"
            value shouldBe AspectQueryStringValue("value2")
            operator.value shouldBe "ILIKE"
            negated shouldBe true
            placeReferenceFirst shouldBe true
        }
    )

    testAspectQueryString(
      "aspectQuery=testAspect3.field3:~value3",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "testAspect3"
            path.mkString(".") shouldBe "field3"
            value shouldBe AspectQueryStringValue("value3")
            operator.value shouldBe "~*"
            negated shouldBe false
            placeReferenceFirst shouldBe true
        }
    )

    testAspectQueryString(
      "aspectQuery=testAspect4.field4:!~value4",
      aq =>
        aq match {
          case AspectQueryWithValue(
              aspectId,
              path,
              value,
              operator,
              negated,
              placeReferenceFirst
              ) =>
            aspectId shouldBe "testAspect4"
            path.mkString(".") shouldBe "field4"
            value shouldBe AspectQueryStringValue("value4")
            operator.value shouldBe "~*"
            negated shouldBe true
            placeReferenceFirst shouldBe true
        }
    )

    def testComparisonOperators(operators: Seq[String]): Unit = {
      operators.map { opt =>
        testAspectQueryString(
          s"aspectQuery=testAspect.field:${opt}test-string-value",
          aq =>
            aq match {
              case AspectQueryWithValue(
                  aspectId,
                  path,
                  value,
                  operator,
                  negated,
                  placeReferenceFirst
                  ) =>
                aspectId shouldBe "testAspect"
                path.mkString(".") shouldBe "field"
                value shouldBe AspectQueryStringValue("test-string-value")
                operator.value shouldBe opt
                negated shouldBe false
                placeReferenceFirst shouldBe true
            }
        )

        testAspectQueryString(
          s"aspectQuery=testAspect.field:${opt}1.54",
          aq =>
            aq match {
              case AspectQueryWithValue(
                  aspectId,
                  path,
                  value,
                  operator,
                  negated,
                  placeReferenceFirst
                  ) =>
                aspectId shouldBe "testAspect"
                path.mkString(".") shouldBe "field"
                // AspectQueryBigDecimalValue should be created for aspectQuery value that's in numeric text
                value shouldBe AspectQueryBigDecimalValue(1.54)
                operator.value shouldBe opt
                negated shouldBe false
                placeReferenceFirst shouldBe true
            }
        )
      }
    }

    testComparisonOperators(List(">", "<", ">=", "<="))

  }

}
