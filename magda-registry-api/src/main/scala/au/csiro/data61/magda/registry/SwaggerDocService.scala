package au.csiro.data61.magda.registry

import java.lang.annotation.Annotation
import java.lang.reflect.Type

import com.github.swagger.akka.model.Info

import scala.reflect.runtime.{universe => ru}
import akka.actor.ActorSystem
import akka.http.scaladsl.model.{HttpEntity, MediaTypes, Uri}
import akka.stream.ActorMaterializer
import com.github.swagger.akka._
import enumeratum.values.IntEnumEntry
import gnieh.diffson._
import io.swagger.converter.{ModelConverter, ModelConverterContext, ModelConverters}
import io.swagger.models.{ArrayModel, ComposedModel, ModelImpl}
import gnieh.diffson.sprayJson.JsonPatch
import io.swagger.models.properties.{ArrayProperty, ObjectProperty, RefProperty, StringProperty}
import spray.json.JsValue

class SwaggerDocService(address: String, port: Int, val registryApiBaseUrl: String, system: ActorSystem) extends SwaggerHttpService with HasActorSystem {
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
  override val basePath = Uri(registryApiBaseUrl).path.toString()
  lazy val allRoutes =
    routes ~
      path(apiDocsBase / "json-patch.json") {
        getFromResource("json-patch.json", MediaTypes.`application/json`)
      }

  def getJsonPatchSchema() = {
    val stream = scala.io.Source.fromInputStream(getClass.getResourceAsStream("/json-patch.json"))
    stream.mkString
  }

  private class Converter extends ModelConverter {
    override def resolveProperty(`type`: Type, context: ModelConverterContext, annotations: Array[Annotation], chain: java.util.Iterator[ModelConverter]) = {
      if (`type`.isInstanceOf[Class[_]]) {
        val cls = `type`.asInstanceOf[Class[_]]
        if (classOf[JsonPatch].isAssignableFrom(cls)) {
          resolveJsonPatchProperty(cls, context, chain)
        } else {
          chain.next().resolveProperty(`type`, context, annotations, chain)
        }
      } else {
        chain.next().resolveProperty(`type`, context, annotations, chain)
      }
    }

    override def resolve(`type`: Type, context: ModelConverterContext, next: java.util.Iterator[ModelConverter]) = {
      if (`type`.isInstanceOf[Class[_]]) {
        val cls = `type`.asInstanceOf[Class[_]]
        if (classOf[IntEnumEntry].isAssignableFrom(cls)) {
          resolveEnum(cls, context, next)
        } else if (classOf[JsonPatch].isAssignableFrom(cls)) {
          // We don't need the patch because it's just an array
          null
        } else {
          next.next().resolve(cls, context, next)
        }
      } else {
        next.next().resolve(`type`, context, next)
      }
    }

    private def resolveEnum(cls: Class[_], context: ModelConverterContext, next: java.util.Iterator[ModelConverter]) = {
      // Find the corresponding object and get its values property
      val m = ru.runtimeMirror(cls.getClassLoader)
      val moduleMirror = m.reflectModule(m.staticModule(cls.getName))
      val singleton = moduleMirror.instance
      val im = m.reflect(singleton)
      val valuesMethodSymbol = im.symbol.info.member(ru.TermName("values")).asMethod
      val valuesMethod = im.reflectMethod(valuesMethodSymbol)
      val values = valuesMethod().asInstanceOf[IndexedSeq[IntEnumEntry]]

      val possibleValues = new java.util.ArrayList[String]()
      values.foreach(entry => {
        possibleValues.add(entry.toString)
      })

      val model = next.next().resolve(cls, context, next).asInstanceOf[ModelImpl]
      val newModel = new ModelImpl()
      newModel.setName(model.getName)
      newModel.setTitle(model.getTitle)
      newModel.setDescription(model.getDescription)
      if (model.getDefaultValue() != null) {
        newModel.setDefaultValue(model.getDefaultValue.toString)
      }
      newModel.setExample(model.getExample)
      newModel.`type`("string")
      newModel.setEnum(possibleValues)
      context.defineModel(newModel.getName(), newModel)
      newModel
    }

    private def resolveJsonPatchProperty(cls: Class[_], context: ModelConverterContext, next: java.util.Iterator[ModelConverter]) = {
      val property = new ArrayProperty()
      property.setItems(new RefProperty("./json-patch.json#/definitions/operation"))
      property
    }
  }

  ModelConverters.getInstance().addConverter(new Converter())
}
