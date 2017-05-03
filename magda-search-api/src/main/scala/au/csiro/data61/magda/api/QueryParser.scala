package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser._

import scala.util.matching.Regex
import java.time.OffsetDateTime

import au.csiro.data61.magda.model.misc.QueryRegion
import au.csiro.data61.magda.spatial.RegionSources
import java.time.ZoneOffset
import com.typesafe.config.Config
import au.csiro.data61.magda.model.misc.Region

private object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  case class Filter(filterName: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
  case class RegionFilter(regionType: String, regionId: String) extends QueryToken
  case object Unspecified extends QueryToken
}

case class QueryCompilationError(error: String)

private class QueryLexer(implicit val config: Config) extends RegexParsers {
  override def skipWhitespace = true
  //  override val whiteSpace = "[\t\r\f\n]+".r

  val filterWords = Seq("from", "to", "by", "as", "in")

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

  def freeTextWord: Parser[Tokens.FreeTextWord] = {
    "[^\\s]+".r ^^ { str => Tokens.FreeTextWord(str.trim) }
  }
  val filterWordsJoined = filterWords.reduce { (left, right) => left + "|" + right }
  def filterWord: Parser[Tokens.Filter] = {
    s"(?i)($filterWordsJoined)\\s+".r ^^ { str =>
      Tokens.Filter(str.trim)
    }
  }

  def unspecified: Parser[Tokens.QueryToken] = {
    s"(?i)${config.getString("strings.unspecifiedWord")}".r ^^ { _ => Tokens.Unspecified }
  }

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | filterWord | unspecified | freeTextWord))

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

  sealed trait Filter extends ReturnedAST
  case class DateFrom(value: FilterValue[OffsetDateTime]) extends Filter
  case class DateTo(value: FilterValue[OffsetDateTime]) extends Filter
  case class Publisher(value: FilterValue[String]) extends Filter
  case class Format(value: FilterValue[String]) extends Filter
  case class ASTRegion(region: FilterValue[QueryRegion]) extends Filter

  sealed trait FilterType extends QueryAST
  case object FromType extends FilterType
  case object ToType extends FilterType
  case object PublisherType extends FilterType
  case object FormatType extends FilterType
  case object RegionType extends FilterType
  case object Ignore extends ReturnedAST

  case class ASTFilterValue(value: FilterValue[String]) extends QueryAST
}

private class QueryParser()(implicit val defaultOffset: ZoneOffset, implicit val config: Config) extends Parsers {
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
    case list => list reduceRight AST.And
  }
  def filters = rep1(region | filterStatement) ^^ {
    case list => list reduceRight AST.And
  }
  def filterStatement: Parser[AST.ReturnedAST] = filterType ~ (filterBody | emptyFilterStatement) ^^ {
    case AST.FromType ~ AST.ASTFilterValue(filterValue)      => parseDateFromRaw(filterValue, false, AST.DateFrom.apply, "from")
    case AST.ToType ~ AST.ASTFilterValue(filterValue)        => parseDateFromRaw(filterValue, true, AST.DateTo.apply, "to")
    case AST.PublisherType ~ AST.ASTFilterValue(filterValue) => AST.Publisher(filterValue)
    case AST.FormatType ~ AST.ASTFilterValue(filterValue)    => AST.Format(filterValue)
    case AST.RegionType ~ AST.ASTFilterValue(filterValue) => filterValue match {
      case Specified(filterValueString) =>
        if (filterValueString.contains(":")) {
          val split = filterValueString.split(":")

          if (split.size < 2) {
            AST.FreeTextWord("in " + filterValueString)
          } else {
            val regionType = split(0)
            val regionId = split(1)
            AST.ASTRegion(Specified(QueryRegion(regionType, regionId)))
          }
        } else {
          AST.FreeTextWord("in " + filterValueString)
        }
      case Unspecified() => AST.ASTRegion(Unspecified())
    }
    case _ ~ AST.Ignore => AST.Ignore
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
        case "in"   => AST.RegionType
      }
    })

  private def filterBody: Parser[AST.ASTFilterValue] =
    rep1(filterBodyWord) ^^ {
      case list => list.reduce((a, b) => (a, b) match {
        case (AST.ASTFilterValue(a), AST.ASTFilterValue(b)) => AST.ASTFilterValue(Specified(a + " " + b))
      })
    }

  private def filterBodyWord: Parser[AST.ASTFilterValue] = {
    accept("filter body word", {
      case Tokens.FreeTextWord(wordString) => AST.ASTFilterValue(Specified(wordString))
      case Tokens.Unspecified              => AST.ASTFilterValue(Unspecified())
    })
  }

  private def quote: Parser[AST.Quote] = {
    accept("quote", { case Tokens.Quote(name) => AST.Quote(name) })
  }

  private def region: Parser[AST.ASTRegion] = {
    accept("region", {
      case Tokens.RegionFilter(regionType, regionId) => AST.ASTRegion(Specified(QueryRegion(regionType, regionId)))
    })
  }

  private def parseDateFromRaw[A >: AST.ReturnedAST](rawDate: FilterValue[String], atEnd: Boolean, applyFn: FilterValue[OffsetDateTime] => A, filterWord: String): A = {
    rawDate match {
      case Specified(dateString) =>
        val date = parseDate(dateString, atEnd)
        date match {
          case DateTimeResult(instant) => applyFn(Specified(instant))
          case ConstantResult(constant) => constant match {
            case Now => applyFn(Specified(OffsetDateTime.now()))
          }
          case _ =>
            AST.And(AST.FreeTextWord(filterWord), AST.FreeTextWord(dateString))
        }
      case Unspecified() => applyFn(Unspecified())
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

class QueryCompiler()(implicit val config: Config) {
  private implicit val defaultOffset = ZoneOffset.of(config.getString("time.defaultOffset"))
  private val lexer = new QueryLexer()
  private val parser = new QueryParser()

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
      case AST.And(left, right)       => merge(flattenAST(left), flattenAST(right))
      case AST.DateFrom(instant)      => Query(dateFrom = Some(instant))
      case AST.DateTo(instant)        => Query(dateTo = Some(instant))
      case AST.Publisher(name)        => Query(publishers = Set(name))
      case AST.Format(format)         => Query(formats = Set(format))
      case AST.ASTRegion(queryRegion) => Query(regions = Set(queryRegion.map(x => Region(x))))
      case AST.FreeTextWord(word)     => Query(freeText = Some(word))
      case AST.Quote(quote)           => Query(quotes = Set(quote))
      case AST.Ignore                 => Query()
    }
  }
}

sealed trait FilterValue[+T] {
  def map[A](a: T => A): FilterValue[A]
}
case class Specified[T](t: T) extends FilterValue[T] {
  override def map[A](a: T => A): FilterValue[A] = Specified(a(t))
  override def toString = t.toString
}
case class Unspecified()(implicit config: Config) extends FilterValue[Nothing] {
  override def map[A](a: Nothing => A): FilterValue[Nothing] = this
  override def toString = config.getString("strings.unspecifiedWord")
}
object FilterValue {
  implicit def filterValueToOption[T](filterValue: FilterValue[T]): Option[T] = filterValue match {
    case Specified(inner) => Some(inner)
    case Unspecified()    => None
  }
}
case class Query(
  freeText: Option[String] = None,
  quotes: Set[String] = Set(),
  publishers: Set[FilterValue[String]] = Set(),
  dateFrom: Option[FilterValue[OffsetDateTime]] = None,
  dateTo: Option[FilterValue[OffsetDateTime]] = None,
  regions: Set[FilterValue[Region]] = Set(),
  formats: Set[FilterValue[String]] = Set(),
  error: Option[String] = None)

