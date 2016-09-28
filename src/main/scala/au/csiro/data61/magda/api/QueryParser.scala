package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser._
import java.time.Instant

private object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  case class Filter(filterName: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
}

trait QueryCompilationError

private object QueryLexer extends RegexParsers {
  case class QueryLexerError(message: String) extends QueryCompilationError

  override def skipWhitespace = true
  override val whiteSpace = "[\t\r\f\n]+".r

  val filterWords = Seq("From", "To", "By", "As")

  def quote: Parser[Tokens.Quote] = {
    """"[^"]*"""".r ^^ { str => Tokens.Quote(str.substring(1, str.length - 1)) }
  }

  def freeTextWord: Parser[Tokens.FreeTextWord] = {
    "\\s*[^\\s]+\\s*".r ^^ { str => Tokens.FreeTextWord(str.trim) }
  }
  def filterWord: Parser[Tokens.Filter] = {
    val filterWordsJoined = filterWords.reduce { (left, right) => left + "|" + right }
    s"(?i)($filterWordsJoined)".r ^^ { str => Tokens.Filter(str) }
  }

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | filterWord | freeTextWord))

  def apply(code: String): Either[QueryLexerError, List[Tokens.QueryToken]] = {
    parse(tokens, code) match {
      case NoSuccess(msg, next)  => Left(QueryLexerError(msg))
      case Success(result, next) => Right(result)
    }
  }
}

object AST {
  sealed trait QueryAST
  case class And(left: QueryAST, right: QueryAST) extends QueryAST
  case class Quote(quote: String) extends QueryAST
  case class FreeTextWord(freeText: String) extends QueryAST
  case class FilterStatement(filterType: FilterType, value: FilterValue) extends QueryAST

  sealed trait FilterType extends QueryAST
  case object FromType extends QueryAST
  case object ToType extends QueryAST
  case object PublisherType extends QueryAST
  case object FormatType extends QueryAST

  case class FilterValue(value: String) extends QueryAST

  sealed trait Filter extends QueryAST
  case class DateFrom(value: Instant) extends Filter
  case class DateTo(value: Instant) extends Filter
  case class Publisher(value: String) extends Filter
  case class Format(value: String) extends Filter
}

private object QueryParser extends Parsers {
  case class QueryParserError(msg: String) extends QueryCompilationError
  override type Elem = Tokens.QueryToken

  class QueryTokenReader(tokens: Seq[Tokens.QueryToken]) extends Reader[Tokens.QueryToken] {
    override def first: Tokens.QueryToken = tokens.head
    override def atEnd: Boolean = tokens.isEmpty
    override def pos: Position = NoPosition
    override def rest: Reader[Tokens.QueryToken] = new QueryTokenReader(tokens.tail)
  }

  def query = phrase(queryMakeup)
  def queryMakeup = (freeText ~ filters) ^^ { case a ~ b => AST.And(a, b) }
  def freeText = rep1(freeTextWord) ^^ { case list => list reduceRight AST.And }
  def filters = rep1(filterStatement) ^^ { case list => list reduceRight AST.And }
  def filterStatement = filterType ~ filterBody ^^ {
    case AST.FromType ~ AST.FilterValue(filterValue)      => parseDateFromRaw(filterValue, AST.DateFrom.apply, AST.And(AST.FreeTextWord("from"), AST.FreeTextWord(filterValue)))
    case AST.ToType ~ AST.FilterValue(filterValue)        => parseDateFromRaw(filterValue, AST.DateTo.apply, AST.And(AST.FreeTextWord("to"), AST.FreeTextWord(filterValue)))
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

  private def parseDateFromRaw[A >: AST.QueryAST](rawDate: String, applyFn: Instant => A, recoveryFn: => AST.QueryAST): A = {
    val date = parseDate(rawDate)
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

  def apply(tokens: Seq[Tokens.QueryToken]): Either[QueryParserError, AST.QueryAST] = {
    val reader = new QueryTokenReader(tokens)
    query(reader) match {
      case NoSuccess(msg, next)  => Left(QueryParserError(msg))
      case Success(result, next) => Right(result)
    }
  }
}

object QueryCompiler {
  def apply(code: String): Either[QueryCompilationError, AST.QueryAST] = {
    for {
      tokens <- QueryLexer(code).right
      ast <- QueryParser(tokens).right
    } yield ast
  }
}