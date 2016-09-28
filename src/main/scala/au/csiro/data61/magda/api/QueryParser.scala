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
  case class DateFrom(rawDate: String) extends QueryToken
  case class DateTo(rawDate: String) extends QueryToken
  case class Publisher(rawPublisher: String) extends QueryToken
  case class Format(rawFormat: String) extends QueryToken
  case class FreeTextWord(general: String) extends QueryToken
}

trait QueryCompilationError

private object QueryLexer extends RegexParsers {
  case class QueryLexerError(message: String) extends QueryCompilationError

  override def skipWhitespace = true
  override val whiteSpace = "[\t\r\f\n]+".r

  def quote: Parser[Tokens.Quote] = {
    """"[^"]*"""".r ^^ { str => Tokens.Quote(str.substring(1, str.length - 1)) }
  }

  private def keyword[R](word: String, constructor: String => R)(): Parser[R] = {
    s"$word [a-zA-Z0-9_]+".r ^^ { str => constructor(str.substring(1 + word.length)) }
  }

  def freeTextWord: Parser[Tokens.FreeTextWord] = {
    "\\s?[^\\s]+\\s?".r ^^ { str => Tokens.FreeTextWord(str) }
  }

  def from = keyword("from", Tokens.DateFrom.apply)
  def to = keyword("to", Tokens.DateTo.apply)
  def by = keyword("by", Tokens.Publisher.apply)
  def as = keyword("as", Tokens.Format.apply)

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | as | from | to | by | freeTextWord))

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
  case class DateFrom(instant: Instant) extends QueryAST
  case class DateTo(instant: Instant) extends QueryAST
  case class Publisher(quote: String) extends QueryAST
  case class Format(quote: String) extends QueryAST
  case class FreeTextWord(freeText: String) extends QueryAST
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

  def query: Parser[AST.QueryAST] = phrase(queryPartList)
  def queryPartList: Parser[AST.QueryAST] = rep1(queryPart) ^^ { case list => list reduceRight AST.And }
  def queryPart: Parser[AST.QueryAST] = {
    quote | format | dateFrom | dateTo | publisher | freeTextWord
  }

  private def quote: Parser[AST.Quote] = {
    accept("quote", { case Tokens.Quote(name) => AST.Quote(name) })
  }

  private def format: Parser[AST.Format] = {
    accept("format", { case Tokens.Format(formatString) => AST.Format(formatString) })
  }

  private def parseDateFromRaw[A >: AST.QueryAST](rawDate: String, applyFn: Instant => A, recoveryFn: => AST.QueryAST) : A = {
    val date = parseDate(rawDate)
    date match {
      case InstantResult(instant) => applyFn(instant)
      case ConstantResult(constant) => constant match {
        case Now => applyFn(Instant.now())
      }
      case _ => recoveryFn
    }
  }

  private def dateFrom: Parser[AST.QueryAST] = {
    accept("from date", {
      case Tokens.DateFrom(rawDate) => parseDateFromRaw(rawDate, AST.DateFrom.apply, AST.And(AST.FreeTextWord("from"), AST.FreeTextWord(rawDate)))
    })
  }

  private def dateTo: Parser[AST.QueryAST] = {
    accept("to date", {
      case Tokens.DateTo(rawDate) => parseDateFromRaw(rawDate, AST.DateTo.apply, AST.And(AST.FreeTextWord("to"), AST.FreeTextWord(rawDate)))
    })
  }

  private def publisher: Parser[AST.Publisher] = {
    accept("publisher", { case Tokens.Publisher(publisher) => AST.Publisher(publisher) })
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