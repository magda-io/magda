package au.csiro.data61.magda.directives

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.{Directive0, _}

import scala.concurrent.Future
import akka.http.scaladsl.model.{
  ContentTypes,
  ExceptionWithErrorInfo,
  HttpEntity
}
import akka.http.scaladsl.unmarshalling.Unmarshaller.UnsupportedContentTypeException
import akka.http.scaladsl.unmarshalling.{
  FromRequestUnmarshaller,
  Unmarshaller,
  Unmarshal
}
import scala.util.{Failure, Success}
import akka.http.scaladsl.server.directives.RouteDirectives.reject
import au.csiro.data61.magda.util.StringUtils.ExtraStringHelperFunctions

object CommonDirectives {

  def onCompleteBlockingTask: Directive0 = extractActorSystem.tflatMap { t =>
    Directive { inner => ctx =>
      val blockingExeCtx = t._1.dispatchers.lookup("blocking-io-dispatcher")
      Future { inner() }(blockingExeCtx).flatMap(_(ctx))(blockingExeCtx)
    }
  }

  def onCompleteBlockingTaskIn(dispatcherId: String): Directive0 =
    extractActorSystem.tflatMap { t =>
      Directive { inner => ctx =>
        val blockingExeCtx = t._1.dispatchers.lookup(dispatcherId)
        Future { inner() }(blockingExeCtx).flatMap(_(ctx))(blockingExeCtx)
      }
    }

  /**
    * Sanitize Json input to remove any Null bytes in Json string as postgreSQL won't accept it
    *
    * Example: sanitizedJsonEntity(as[Record])
    *
    * @param um Unmarshaller
    * @tparam T
    * @return
    */
  def sanitizedJsonEntity[T](um: FromRequestUnmarshaller[T]): Directive1[T] =
    extractRequestContext.flatMap[Tuple1[T]] { ctx =>
      import ctx.executionContext
      import ctx.materializer

      val unmarshalled: Future[T] = Unmarshal(ctx.request).to[String].flatMap {
        jsonString =>
          val ent = HttpEntity(
            ContentTypes.`application/json`,
            jsonString.removeNullByteFromJsonString
          )
          um(ctx.request.mapEntity(_ => ent))
      }

      onComplete(unmarshalled).flatMap {
        case Success(value) =>
          provide(value)
        case Failure(RejectionError(r)) =>
          reject(r)
        case Failure(Unmarshaller.NoContentException) =>
          reject(RequestEntityExpectedRejection)
        case Failure(x: UnsupportedContentTypeException) =>
          reject(
            UnsupportedRequestContentTypeRejection(
              x.supported,
              x.actualContentType
            )
          )
        case Failure(x: IllegalArgumentException) =>
          reject(ValidationRejection(x.getMessage.nullAsEmpty, Some(x)))
        case Failure(x: ExceptionWithErrorInfo) =>
          reject(
            MalformedRequestContentRejection(
              x.info.format(ctx.settings.verboseErrorMessages),
              x
            )
          )
        case Failure(x) =>
          reject(MalformedRequestContentRejection(x.getMessage.nullAsEmpty, x))
      }
    } & cancelRejections(
      RequestEntityExpectedRejection.getClass,
      classOf[UnsupportedRequestContentTypeRejection]
    )
}
