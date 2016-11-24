package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser._
import java.time.Instant

import au.csiro.data61.magda.model.misc.MatchingRegion
import au.csiro.data61.magda.spatial.RegionSource

import scala.util.matching.Regex

private object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  case class Filter(filterName: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
  case class RegionFilter(regionType: String, regionId: String) extends QueryToken
}

case class QueryCompilationError(error: String)

private object QueryLexer extends RegexParsers {
  override def skipWhitespace = true
  override val whiteSpace = "[\t\r\f\n]+".r

  val filterWords = Seq("From", "To", "By", "As")

  /** A parser that matches a regex string and returns the Match */
  def regexMatch(r: Regex): Parser[Regex.Match] = new Parser[Regex.Match] {
    def apply(in: Input) = {
      val source = in.source
      val offset = in.offset
      val start = handleWhiteSpace(source, offset)
      (r findPrefixMatchOf (source.subSequence(start, source.length))) match {
        case Some(matched) =>
          Success(matched,
            in.drop(start + matched.end - offset))
        case None =>
          Failure("string matching regex `" + r + "' expected but `" + in.first + "' found", in.drop(start - offset))
      }
    }
  }

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
  def region: Parser[Tokens.RegionFilter] = {
    val regionTypesJoined = RegionSource.sources.map(_.name).reduce { (left, right) => left + "|" + right }
    regexMatch(s"(^|\\s)(?i)in ($regionTypesJoined):([A-Za-z0-9]+)(\\s|$$)".r) ^^ { regexMatch => Tokens.RegionFilter(regexMatch.group(2), regexMatch.group(3)) }
  }

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | region | filterWord | freeTextWord))

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
  case class ASTRegion(region: Region) extends Filter

  sealed trait FilterType extends QueryAST
  case object FromType extends FilterType
  case object ToType extends FilterType
  case object PublisherType extends FilterType
  case object FormatType extends FilterType
  case object RegionType extends FilterType

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
  def filters = rep1(region | filterStatement) ^^ { case list => list reduceRight AST.And }
  def filterStatement = filterType ~ filterBody ^^ {
    case AST.FromType ~ AST.FilterValue(filterValue)      => parseDateFromRaw(filterValue, false, AST.DateFrom.apply, AST.And(AST.FreeTextWord("from"), AST.FreeTextWord(filterValue)))
    case AST.ToType ~ AST.FilterValue(filterValue)        => parseDateFromRaw(filterValue, true, AST.DateTo.apply, AST.And(AST.FreeTextWord("to"), AST.FreeTextWord(filterValue)))
    case AST.PublisherType ~ AST.FilterValue(filterValue) => AST.Publisher(filterValue)
    case AST.FormatType ~ AST.FilterValue(filterValue)    => AST.Format(filterValue)
  }

  def filterType =
    accept("filter type", {
      case Tokens.Filter(name) => name.toLowerCase() match {
        case "from" => AST.FromType
        case "to"   => AST.ToType
        case "by"   => AST.PublisherType
        case "as"   => AST.FormatType
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

  private def region: Parser[AST.ASTRegion] = {
    accept("region", {
      case Tokens.RegionFilter(regionType, regionId) => RegionSource.forName(regionType) match {
        case Some(regionSource) => AST.ASTRegion(Region(regionType, regionId, "[Unknown]", None))
        case None               => throw new RuntimeException("Could not find region for type " + regionType)
      }
    })
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
      case AST.And(left, right)   => merge(flattenAST(left), flattenAST(right))
      case AST.DateFrom(instant)  => Query(dateFrom = Some(instant))
      case AST.DateTo(instant)    => Query(dateTo = Some(instant))
      case AST.Publisher(name)    => Query(publishers = Seq(name))
      case AST.Format(format)     => Query(formats = Seq(format))
      case AST.ASTRegion(region)  => Query(regions = Seq(region))
      case AST.FreeTextWord(word) => Query(freeText = Some(word))
      case AST.Quote(quote)       => Query(quotes = Seq(quote))
    }
  }
}

case class BoundingBox(
  west: Double,
  south: Double,
  east: Double,
  north: Double)

case class Region(
  regionType: String,
  regionId: String,
  regionName: String,
  boundingBox: Option[BoundingBox])

case class Query(
  freeText: Option[String] = None,
  quotes: Seq[String] = Nil,
  publishers: Seq[String] = Nil,
  dateFrom: Option[Instant] = None,
  dateTo: Option[Instant] = None,
  regions: Seq[Region] = Nil,
  formats: Seq[String] = Nil,
  error: Option[String] = None)