package au.csiro.data61.magda.registry

import java.lang.annotation.Annotation
import java.lang.reflect.Type

import com.github.swagger.akka.model.Info

import scala.reflect.runtime.{universe => ru}
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import com.github.swagger.akka._
import enumeratum.values.IntEnumEntry
import io.swagger.converter.{ModelConverter, ModelConverterContext, ModelConverters}
import io.swagger.models.ModelImpl

class SwaggerDocService(address: String, port: Int, system: ActorSystem) extends SwaggerHttpService with HasActorSystem {
  override implicit val actorSystem: ActorSystem = system
  override implicit val materializer: ActorMaterializer = ActorMaterializer()
  override val apiTypes = Seq(
    ru.typeOf[AspectsService],
    ru.typeOf[RecordsService],
    ru.typeOf[RecordAspectsService],
    ru.typeOf[RecordHistoryService],
    ru.typeOf[HooksService])
  override val host = ""
  override val info = Info(version = "0.1")
  override val basePath = "/api/0.1/"

  private class Foo extends ModelConverter {
    override def resolveProperty(`type`: Type, context: ModelConverterContext, annotations: Array[Annotation], chain: java.util.Iterator[ModelConverter]) = {
      chain.next().resolveProperty(`type`, context, annotations, chain)
    }

    override def resolve(`type`: Type, context: ModelConverterContext, next: java.util.Iterator[ModelConverter]) = {
      if (`type`.isInstanceOf[Class[_]]) {
        val cls = `type`.asInstanceOf[Class[_]]
        if (classOf[IntEnumEntry].isAssignableFrom(cls)) {
          // Find the corresponding object and get its values property
          val objClass = cls.getClassLoader.loadClass(cls.getName + "$")
          val valuesMethod = objClass.getMethod("values")
          val objSingleton = objClass.getField("MODULE$").get(null)
          val values = valuesMethod.invoke(objSingleton).asInstanceOf[IndexedSeq[IntEnumEntry]]

          val impl = new ModelImpl()
          impl.setName(cls.getSimpleName())
          impl.`type`("string")

          val possibleValues = new java.util.ArrayList[String]()
          values.foreach(entry => {
            possibleValues.add(entry.toString)
          })
          impl.setEnum(possibleValues)
          context.defineModel(impl.getName(), impl)
          impl
        } else {
          next.next().resolve(`type`, context, next)
        }
      } else {
        next.next().resolve(`type`, context, next)
      }
    }
  }

  ModelConverters.getInstance().addConverter(new Foo())
}
