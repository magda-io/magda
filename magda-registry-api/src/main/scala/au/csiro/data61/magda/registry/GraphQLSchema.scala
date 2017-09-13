package au.csiro.data61.magda.registry

import sangria.execution.deferred.{Fetcher, HasId}
import sangria.schema._
import spray.json._
import enumeratum._

import scala.concurrent.Future

/**
 * Defines a GraphQL schema for the current project
 */
object GraphQLSchema {

  val source = """{
    "aspects": [
      {
        "name": "dataset_distributions",
        "schema": {
          "$schema": "http://json-schema.org/hyper-schema#",
          "title": "The distributions of a dataset",
          "description": "Specifies the list of distributions of a dataset.",
          "type": "object",
          "properties": {
            "distributions": {
              "title": "The distributions of this dataset.",
              "type": "array",
              "items": {
                "title": "A URI of a distribution of this dataset.",
                "type": "string",
                "links": [
                  {
                    "href": "/api/v0/registry/records/{$}",
                    "rel": "item"
                  }
                ]
              }
            }
          }
        }
      },
      {
        "name": "source_link_status",
        "schema": {
          "$schema": "http://json-schema.org/schema#",
          "title": "Aspect describing source link status of a distribution (active or broken)",
          "type": "object",
          "properties": {
            "status": {
              "type": "string",
              "enum": [
                "active",
                "broken"
              ]
            },
            "httpStatusCode": {
              "type": "integer"
            },
            "errorDetails": {
              "type": "string"
            }
          }
        }
      }
    ]
  }"""

  sealed abstract class JsonSchemaType(override val entryName: String) extends EnumEntry
  object JsonSchemaType extends Enum[JsonSchemaType] {
    val values = findValues
    case object String extends JsonSchemaType("string")
    case object Integer extends JsonSchemaType("integer")
    case object Array extends JsonSchemaType("array")
    case object Object extends JsonSchemaType("object")
  }

  // case class SchemaClass(properties: Option[Map[String, PropType]])
  // case class Aspect(name: String, schema: SchemaClass)
  // case class Aspects(aspects: List[Aspect])

// Decode aspect schema directly into ObjectType
// List[JsValue] -> Map[String (aspect name), ObjectType (aspect def)]
// Aspect =


  object AspectJsonProtocol extends DefaultJsonProtocol {
    def makeResolver(name: String, outputType: OutputType[_])(ctx: Context[Unit, JsObject]): Action[Unit, _] = {
      println(ctx.value)
      ctx.value.fields.get(name).map(x => outputType match {
        case StringType => x.convertTo[String]
        case IntType => x.convertTo[Int]
        case ListType(_) => x.convertTo[List[JsValue]]
        case ObjectType(_,_,_,_,_,_) => x.asJsObject
        case _ => None
      })
    }

    def constructField(name: String, outType: OutputType[Any]) = {
      Field(name, OptionType(outType), resolve = makeResolver(name, outType))
    }

    def constructSchemaDefinition(path: String, schema: JsObject): Option[OutputType[_]] = {
      schema.fields.get("type").flatMap(x => JsonSchemaType.withNameInsensitiveOption(x.convertTo[String].toUpperCase)).flatMap({
        case JsonSchemaType.String => Some(StringType)
        case JsonSchemaType.Integer => Some(IntType)
        case JsonSchemaType.Array => schema.fields.get("items").map(_.asJsObject).flatMap(x => constructSchemaDefinition(path + "_items", x)).map(x => ListType(x))
        case JsonSchemaType.Object => schema.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList.flatMap({
          case (name, schema) => constructSchemaDefinition(path + "_" + name, schema.asJsObject).map(outType => constructField(name, outType))
        })).map(x => ObjectType(path, fields[Unit, JsObject](x:_*)))
        case _ => None

      })
    }

    // implicit object SchemaJsonFormat extends RootJsonFormat[SchemaClass] {
    //   def read(value: JsObject) = {
    //     constructSchemaDefinition("root", value)
    //   }
    // }
    // def constructField(name: String, schema: JsObject): Option[Field[_,_]] = {
    //   schema.fields.get("type").map(_.asInstanceOf[JsString].value).map({
    //     case "string" => Field(name, OptionType(StringType), resolve = _.value.fields.get(name).map(_.asInstanceOf[JsString].value))
    //     case "integer" => Field(name, OptionType(IntType), resolve = _.value.fields.get(name).map(_.convertTo[Int]))
    //     case "array" => Field(name, OptionType(ArrayT))
    //   })
    // }
    // implicit object ObjectTypeJsonFormat extends RootJsonFormat[OutputType] {
    //   def read(value: JsValue) = {
    //     value
    //   }
    // }
    // implicit object PropTypeJsonFormat extends RootJsonFormat[PropType] {
    //   def write(obj: PropType) = obj.toString.toLowerCase.toJson
    //   def read(value: JsValue) = {
    //     PropType.withName(value.convertTo[String].toUpperCase)
    //   }
    // }
    // implicit object SchemaJsonFormat extends RootJsonFormat[SchemaClass] {
    //   def write(obj: SchemaClass) = obj.toJson
    //   def read(value: JsValue) = {
    //     val propTypesMap = for {
    //       properties <- value.asJsObject.fields.get("properties")
    //       asMap <- Some(properties.convertTo[Map[String, JsValue]])
    //       asPropTypesMap <- Some(asMap mapValues { _.asJsObject.fields.get("type") map {x => println(x); x.convertTo[PropType]} } collect { case (key, Some(value)) => (key, value)})
    //     } yield asPropTypesMap
    //     SchemaClass(propTypesMap)
    //   }
    // }
    // implicit val aspectFormat = jsonFormat(Aspect, "name", "schema")
    // implicit val aspectsFormat = jsonFormat(Aspects, "aspects")
  }

  import AspectJsonProtocol._


  case class Record(id: String, name: String, aspectsList: List[String], aspects: JsObject) // might want to change aspects to a Map[String, JsValue sometime]

  lazy val RecordType = ObjectType(
    "Record",
    () => fields[Unit, Record](
      Field("id", StringType, resolve = _.value.id),
      Field("name", StringType, resolve = _.value.name),
      Field("aspectsList", ListType(StringType), resolve = _.value.aspectsList),
      Field("aspects", Aspects, resolve = _.value.aspects)
    )
  )

  case class RecordsPageGraphQL(records: List[Record], nextPageToken: String)

  val RecordsPageGraphQLType = ObjectType("RecordsPage", fields[Unit,RecordsPageGraphQL](
    Field("records", ListType(RecordType), resolve = _.value.records),
    Field("nextPageToken", StringType, resolve = _.value.nextPageToken)
  ))

  val pageTokenArg = Argument("pageToken", OptionInputType(StringType))
  val Query = ObjectType(
    "Query", fields[GraphQLDataFetcher, Unit](
      Field("allRecords", RecordsPageGraphQLType,
      arguments = pageTokenArg :: Nil,
      resolve = ctx => ctx.ctx.getRecordsPage(ctx.arg(pageTokenArg)))
    )
  )

  val aspectFields = source.parseJson.asJsObject.fields.get("aspects").get.convertTo[List[JsValue]].flatMap(aspect => aspect.asJsObject.getFields("name", "schema") match {
    case Seq(JsString(name), schema) => constructSchemaDefinition("aspects_" + name, schema.asJsObject).map(outType => constructField(name, outType))
  })
  val Aspects = ObjectType(
    "Aspects",
    fields[Unit, JsObject](aspectFields:_*)
  )

  val MagdaSchema = Schema(Query)
}
