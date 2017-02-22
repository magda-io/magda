package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser._

import scala.util.matching.Regex
import java.time.OffsetDateTime

import au.csiro.data61.magda.model.misc.Region
import au.csiro.data61.magda.spatial.RegionSources
import java.time.ZoneOffset
import com.typesafe.config.Config

private object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  case class Filter(filterName: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
  case class RegionFilter(regionType: String, regionId: String) extends QueryToken
  case class WhiteSpace() extends QueryToken
}

case class QueryCompilationError(error: String)

private class QueryLexer(regionSources: RegionSources) extends RegexParsers {
  override def skipWhitespace = true
//  override val whiteSpace = "[\t\r\f\n]+".r

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
    """"[^"]*"""".r ^^ { str =>
      val trimmed = str.trim
      Tokens.Quote(trimmed.substring(1, trimmed.length - 1))
    }
  }

//  def whiteSpaceParser: Parser[Tokens.WhiteSpace] = {
//    "\\s+".r ^^ { _ => Tokens.WhiteSpace() }
//  }

  def freeTextWord: Parser[Tokens.FreeTextWord] = {
    "[^\\s]+".r ^^ { str => Tokens.FreeTextWord(str.trim) }
  }
  val filterWordsJoined = filterWords.reduce { (left, right) => left + "|" + right }
  def filterWord: Parser[Tokens.Filter] = {
    s"(?i)($filterWordsJoined)\\s+".r ^^ { str =>
      Tokens.Filter(str.trim)
    }
  }
  def region: Parser[Tokens.RegionFilter] = {
    val regionTypesJoined = regionSources.sources.map(_.name).reduce { (left, right) => left + "|" + right }
    regexMatch(s"(?i)in ($regionTypesJoined):([A-Za-z0-9]+)".r) ^^ { regexMatch => Tokens.RegionFilter(regexMatch.group(2), regexMatch.group(3)) }
  }

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | region | filterWord | freeTextWord))

  def apply(code: String): Either[QueryCompilationError, List[Tokens.QueryToken]] = {
    parse(tokens, code) match {
      case NoSuccess(msg, next) =>
        Left(QueryCompilationError(msg))
      case Success(result, next) =>
        Right(result)
    }
  }
}

object AST {
  sealed trait QueryAST
  sealed trait ReturnedAST extends QueryAST
  case class And(left: ReturnedAST, right: ReturnedAST) extends ReturnedAST
  case class Quote(quote: String) extends ReturnedAST
  case class FreeTextWord(freeText: String) extends ReturnedAST
//  case object WhiteSpace extends ReturnedAST

  sealed trait Filter extends ReturnedAST
  case class DateFrom(value: OffsetDateTime) extends Filter
  case class DateTo(value: OffsetDateTime) extends Filter
  case class Publisher(value: String) extends Filter
  case class Format(value: String) extends Filter
  case class ASTRegion(region: Region) extends Filter

  sealed trait FilterType extends QueryAST
  case object FromType extends FilterType
  case object ToType extends FilterType
  case object PublisherType extends FilterType
  case object FormatType extends FilterType
  case object RegionType extends FilterType
  case object Ignore extends ReturnedAST

  case class FilterStatement(filterType: FilterType, value: FilterValue) extends QueryAST
  case class FilterValue(value: String) extends QueryAST
}

private class QueryParser(regionSources: RegionSources)(implicit val defaultOffset: ZoneOffset) extends Parsers {
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
  def queryText = queryTextSep
  def queryTextSep = rep1(freeTextWord | quote) ^^ {
    //    case Nil  => AST.Ignore
    case list => list reduceRight AST.And
  }
  def filters = rep1(region | filterStatement | emptyFilterStatement) ^^ {
    //    case Nil  => AST.Ignore
    case list => list reduceRight AST.And
  }
  def filterStatement = filterType ~ filterBody ^^ {
    case AST.FromType ~ AST.FilterValue(filterValue)      => parseDateFromRaw(filterValue, false, AST.DateFrom.apply, AST.And(AST.FreeTextWord("from"), AST.FreeTextWord(filterValue)))
    case AST.ToType ~ AST.FilterValue(filterValue)        => parseDateFromRaw(filterValue, true, AST.DateTo.apply, AST.And(AST.FreeTextWord("to"), AST.FreeTextWord(filterValue)))
    case AST.PublisherType ~ AST.FilterValue(filterValue) => AST.Publisher(filterValue)
    case AST.FormatType ~ AST.FilterValue(filterValue)    => AST.Format(filterValue)
  }

  def emptyFilterStatement = filterType ^^ {
    case _ => AST.Ignore
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

//  def whiteSpaceP = accept("whitespace", {
//    case Tokens.WhiteSpace() => AST.Ignore
//  })

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
      case Tokens.RegionFilter(regionType, regionId) => regionSources.forName(regionType) match {
        case Some(regionSource) => AST.ASTRegion(Region(regionType, regionId, "[Unknown]", None))
        case None               => throw new RuntimeException("Could not find region for type " + regionType)
      }
    })
  }

  private def parseDateFromRaw[A >: AST.ReturnedAST](rawDate: String, atEnd: Boolean, applyFn: OffsetDateTime => A, recoveryFn: => AST.ReturnedAST): A = {
    val date = parseDate(rawDate, atEnd)
    date match {
      case DateTimeResult(instant) => applyFn(instant)
      case ConstantResult(constant) => constant match {
        case Now => applyFn(OffsetDateTime.now())
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
      case NoSuccess(msg, next) =>
        Left(QueryCompilationError(msg))
      case Success(result, next) => Right(result)
    }
  }
}

class QueryCompiler(regionSources: RegionSources)(implicit val config: Config) {
  private implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))
  private val lexer = new QueryLexer(regionSources)
  private val parser = new QueryParser(regionSources)

  def apply(code: String): Query = {
    val result = for {
      tokens <- lexer.apply(code).right
      ast <- parser.apply(tokens).right
    } yield ast

    result match {
      case Right(ast) =>
        val flat = flattenAST(ast)
        flat
      case Left(QueryCompilationError(error)) =>
        Query(freeText = Some(code), error = Some(error))
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
      case AST.Publisher(name)    => Query(publishers = Set(name))
      case AST.Format(format)     => Query(formats = Set(format))
      case AST.ASTRegion(region)  => Query(regions = Set(region))
      case AST.FreeTextWord(word) => Query(freeText = Some(word))
      case AST.Quote(quote)       => Query(quotes = Set(quote))
      case AST.Ignore             => Query()
    }
  }
}

case class Query(
  freeText: Option[String] = None,
  quotes: Set[String] = Set(),
  publishers: Set[String] = Set(),
  dateFrom: Option[OffsetDateTime] = None,
  dateTo: Option[OffsetDateTime] = None,
  regions: Set[Region] = Set(),
  formats: Set[String] = Set(),
  error: Option[String] = None)