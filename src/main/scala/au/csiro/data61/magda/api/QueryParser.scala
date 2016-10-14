package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser._
import java.time.Instant
import au.csiro.data61.magda.spatial.RegionSource

private object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  case class Filter(filterName: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
}

case class QueryCompilationError(error: String)

private object QueryLexer extends RegexParsers {
  override def skipWhitespace = true
  override val whiteSpace = "[\t\r\f\n]+".r

  val filterWords = Seq("From", "To", "By", "As", "In")

  def quote: Parser[Tokens.Quote] = {
    """"[^"]*"""".r ^^ { str => Tokens.Quote(str.substring(1, str.length - 1)) }
  }

  def freeTextWord: Parser[Tokens.FreeTextWord] = {
    "\\s*[^\\s]+\\s*".r ^^ { str => Tokens.FreeTextWord(str.trim) }
  }
  def filterWord: Parser[Tokens.Filter] = {
    val filterWordsJoined = filterWords.reduce { (left, right) => left + "|" + right }
    s"(^|\\s)(?i)($filterWordsJoined)(\\s|$$)".r ^^ { str => Tokens.Filter(str.trim) }
  }

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | filterWord | freeTextWord))

  def apply(code: String): Either[QueryCompilationError, List[Tokens.QueryToken]] = {
    parse(tokens, code) match {
      case NoSuccess(msg, next)  => Left(QueryCompilationError(msg))
      case Success(result, next) => Right(result)
    }
  }
}

object AST {
  sealed trait QueryAST
  sealed trait ReturnedAST extends QueryAST
  case class And(left: ReturnedAST, right: ReturnedAST) extends ReturnedAST
  case class Quote(quote: String) extends ReturnedAST
  case class FreeTextWord(freeText: String) extends ReturnedAST

  sealed trait Filter extends ReturnedAST
  case class DateFrom(value: Instant) extends Filter
  case class DateTo(value: Instant) extends Filter
  case class Publisher(value: String) extends Filter
  case class Format(value: String) extends Filter
  case class RegionId(value: String) extends Filter

  sealed trait FilterType extends QueryAST
  case object FromType extends FilterType
  case object ToType extends FilterType
  case object PublisherType extends FilterType
  case object FormatType extends FilterType
  case object RegionIdType extends FilterType

  case class FilterStatement(filterType: FilterType, value: FilterValue) extends QueryAST
  case class FilterValue(value: String) extends QueryAST
}

private object QueryParser extends Parsers {
  override type Elem = Tokens.QueryToken

  class QueryTokenReader(tokens: Seq[Tokens.QueryToken]) extends Reader[Tokens.QueryToken] {
    override def first: Tokens.QueryToken = tokens.head
    override def atEnd: Boolean = tokens.isEmpty
    override def pos: Position = NoPosition
    override def rest: Reader[Tokens.QueryToken] = new QueryTokenReader(tokens.tail)
  }

  def query = phrase(queryMakeup)
  def queryMakeup = queryAndFilters | queryText | filters
  def queryAndFilters = (queryText ~ filters) ^^ { case a ~ b => AST.And(a, b) }
  def queryText = rep1(freeTextWord | quote) ^^ { case list => list reduceRight AST.And }
  def filters = rep1(filterStatement) ^^ { case list => list reduceRight AST.And }
  def filterStatement = filterType ~ filterBody ^^ {
    case AST.FromType ~ AST.FilterValue(filterValue)      => parseDateFromRaw(filterValue, false, AST.DateFrom.apply, AST.And(AST.FreeTextWord("from"), AST.FreeTextWord(filterValue)))
    case AST.ToType ~ AST.FilterValue(filterValue)        => parseDateFromRaw(filterValue, true, AST.DateTo.apply, AST.And(AST.FreeTextWord("to"), AST.FreeTextWord(filterValue)))
    case AST.PublisherType ~ AST.FilterValue(filterValue) => AST.Publisher(filterValue)
    case AST.FormatType ~ AST.FilterValue(filterValue)    => AST.Format(filterValue)
    case AST.RegionIdType ~ AST.FilterValue(filterValue)  => AST.RegionId(filterValue)
  }

  def filterType =
    accept("filter type", {
      case Tokens.Filter(name) => name.toLowerCase() match {
        case "from" => AST.FromType
        case "to"   => AST.ToType
        case "by"   => AST.PublisherType
        case "as"   => AST.FormatType
        case "in"   => AST.RegionIdType
      }
    })

  private def filterBody: Parser[AST.FilterValue] =
    rep1(filterBodyWord) ^^ {
      case list => list.reduce((a, b) => (a, b) match {
        case (AST.FilterValue(a), AST.FilterValue(b)) => AST.FilterValue(a + " " + b)
      })
    }

  private def filterBodyWord: Parser[AST.FilterValue] = {
    accept("filter body word", { case Tokens.FreeTextWord(formatString) => AST.FilterValue(formatString) })
  }

  private def quote: Parser[AST.Quote] = {
    accept("quote", { case Tokens.Quote(name) => AST.Quote(name) })
  }

  private def parseDateFromRaw[A >: AST.ReturnedAST](rawDate: String, atEnd: Boolean, applyFn: Instant => A, recoveryFn: => AST.ReturnedAST): A = {
    val date = parseDate(rawDate, atEnd)
    date match {
      case InstantResult(instant) => applyFn(instant)
      case ConstantResult(constant) => constant match {
        case Now => applyFn(Instant.now())
      }
      case _ => recoveryFn
    }
  }

  private def freeTextWord: Parser[AST.FreeTextWord] = {
    accept("free text", { case Tokens.FreeTextWord(freeText) => AST.FreeTextWord(freeText.trim) })
  }

  def apply(tokens: Seq[Tokens.QueryToken]): Either[QueryCompilationError, AST.ReturnedAST] = {
    val reader = new QueryTokenReader(tokens)
    query(reader) match {
      case NoSuccess(msg, next)  => Left(QueryCompilationError(msg))
      case Success(result, next) => Right(result)
    }
  }
}

object QueryCompiler {
  def apply(code: String): Query = {
    val result = for {
      tokens <- QueryLexer(code).right
      ast <- QueryParser(tokens).right
    } yield ast

    result match {
      case Right(ast)                         => flattenAST(ast)
      case Left(QueryCompilationError(error)) => Query(freeText = Some(code), error = Some(error))
    }
  }

  def flattenAST(ast: AST.ReturnedAST): Query = {
    def merge(left: Query, right: Query): Query = left.copy(
      freeText = (left.freeText, right.freeText) match {
        case (None, None)              => None
        case (some, None)              => some
        case (None, some)              => some
        case (Some(left), Some(right)) => Some(left + " " + right)
      },
      publishers = left.publishers ++ right.publishers,
      dateFrom = right.dateFrom.orElse(left.dateFrom),
      dateTo = right.dateTo.orElse(left.dateTo),
      formats = left.formats ++ right.formats,
      quotes = left.quotes ++ right.quotes,
      regions = left.regions ++ right.regions
    )

    ast match {
      case AST.And(left, right)  => merge(flattenAST(left), flattenAST(right))
      case AST.DateFrom(instant) => Query(dateFrom = Some(instant))
      case AST.DateTo(instant)   => Query(dateTo = Some(instant))
      case AST.Publisher(name)   => Query(publishers = Seq(name))
      case AST.Format(format)    => Query(formats = Seq(format))
      case AST.RegionId(region) =>
        val option = region.split(":") match {
          case Array(regionType, regionId) => RegionSource.forName(regionType) match {
            case Some(regionSource) => Some(Query(regions = Seq(new Region(regionSource.name, regionId))))
            case _                  => None
          }
          case _ => None
        }

        option match {
          case Some(query) => query
          case None        => Query(freeText = Some("in " + region))
        }
      case AST.FreeTextWord(word) => Query(freeText = Some(word))
      case AST.Quote(quote)       => Query(quotes = Seq(quote))
    }
  }
}

case class Region(
  regionType: String,
  regionId: String)

case class Query(
  freeText: Option[String] = None,
  quotes: Seq[String] = Nil,
  publishers: Seq[String] = Nil,
  dateFrom: Option[Instant] = None,
  dateTo: Option[Instant] = None,
  regions: Seq[Region] = Nil,
  formats: Seq[String] = Nil,
  error: Option[String] = None)