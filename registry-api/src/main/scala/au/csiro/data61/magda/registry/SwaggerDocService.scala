package au.csiro.data61.magda.registry

import com.github.swagger.akka.model.Info

import scala.reflect.runtime.{universe => ru}
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import com.github.swagger.akka._

class SwaggerDocService(address: String, port: Int, system: ActorSystem) extends SwaggerHttpService with HasActorSystem {
  override implicit val actorSystem: ActorSystem = system
  override implicit val materializer: ActorMaterializer = ActorMaterializer()
  override val apiTypes = Seq(ru.typeOf[SectionsService], ru.typeOf[RecordsService], ru.typeOf[RecordSectionsService])
  override val host = ""
  override val info = Info(version = "0.1")
  override val basePath = "/api/0.1/"
}