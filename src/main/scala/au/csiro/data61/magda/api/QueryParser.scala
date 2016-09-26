package au.csiro.data61.magda.api

import scala.util.parsing.combinator.RegexParsers
import scala.util.parsing.combinator.Parsers
import scala.util.parsing.input.Reader
import scala.util.parsing.input.Position
import scala.util.parsing.input.NoPosition
import au.csiro.data61.magda.util.DateParser

object Tokens {
  sealed trait QueryToken
  case class Quote(exactQuery: String) extends QueryToken
  //    case class DateFrom(rawDate: String) extends QueryToken
  //    case class DateTo(rawDate: String) extends QueryToken
  //    case class Publisher(rawPublisher: String) extends QueryToken
  case class Format(rawFormat: String) extends QueryToken
  case class FreeText(general: String) extends QueryToken
}

trait QueryCompilationError

object QueryLexer extends RegexParsers {
  case class QueryLexerError(message: String) extends QueryCompilationError

  override def skipWhitespace = true
  override val whiteSpace = "[\t\r\f\n]+".r

  def quote: Parser[Tokens.Quote] = {
    """"[^"]*"""".r ^^ { str => Tokens.Quote(str.substring(1, str.length - 1)) }
  }

  private def keyword[R](word: String, constructor: String => R)(): Parser[R] = {
    s"$word [a-zA-Z0-9_]+".r ^^ { str => constructor(str.substring(2 + word.length)) }
  }

  def freeText: Parser[Tokens.FreeText] = {
    ".+".r ^^ { str => Tokens.FreeText(str) }
  }

  //    def from = keyword("from", Tokens.DateFrom.apply)
  //    def to = keyword("to", Tokens.DateTo.apply)
  //    def by = keyword("by", Tokens.Publisher.apply)
  def as = keyword("as", Tokens.Format.apply)

  def tokens: Parser[List[Tokens.QueryToken]] = phrase(rep1(quote | as | freeText))

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
  //    case class DateFrom(quote: DateParser.ParseResult) extends QueryAST
  //    case class DateTo(quote: DateParser.ParseResult) extends QueryAST
  //    case class Publisher(quote: String) extends QueryAST
  case class Format(quote: String) extends QueryAST
  case class FreeText(freeText: String) extends QueryAST
}

object QueryParser extends Parsers {
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
    quote | format | freeText
  }

  private def quote: Parser[AST.Quote] = {
    accept("quote", { case Tokens.Quote(name) => AST.Quote(name) })
  }

  private def format: Parser[AST.Format] = {
    accept("from", { case Tokens.Format(formatString) => AST.Format(formatString) })
  }

  private def freeText: Parser[AST.FreeText] = {
    accept("free text", { case Tokens.FreeText(freeText) => AST.FreeText(freeText) })
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