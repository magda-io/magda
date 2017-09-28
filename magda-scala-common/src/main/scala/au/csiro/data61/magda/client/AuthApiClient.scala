package au.csiro.data61.magda.client

import akka.stream.Materializer
import akka.actor.ActorSystem
import com.typesafe.config.Config
import scala.concurrent.ExecutionContext
import au.csiro.data61.magda.model.Auth.AuthProtocols
import au.csiro.data61.magda.model.Auth.User
import java.net.URL
import akka.http.scaladsl.Http
import scala.concurrent.Future
import akka.http.scaladsl.model.HttpRequest
import akka.http.scaladsl.unmarshalling.Unmarshal
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._

class AuthApiClient(httpFetcher: HttpFetcher)(implicit val config: Config, implicit val system: ActorSystem, implicit val executor: ExecutionContext, implicit val materializer: Materializer) extends AuthProtocols {
  def this()(implicit config: Config, system: ActorSystem, executor: ExecutionContext, materializer: Materializer) = {
    this(HttpFetcher(new URL(config.getString("authApi.baseUrl"))))(config, system, executor, materializer)
  }

  def getUserPublic(userId: String): Future[User] = {
    val responseFuture = httpFetcher.get(s"/v0/public/users/$userId")

    responseFuture.flatMap(response => response.status match {
      case StatusCodes.OK => Unmarshal(response.entity).to[User]
      case _              => Unmarshal(response.entity).to[String].map(error => throw new Exception(error))
    })
  }

}