package au.csiro.data61.magda.registry

import sangria.schema._
import spray.json._
import enumeratum._


/**
 * Defines a GraphQL schema for the current project
 */
object GraphQLSchema {

  /*
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
      */

  val source = """{
    "aspects": [
      {
        "name": "test_record_link",
        "schema": {
          "$schema": "http://json-schema.org/hyper-schema#",
          "title": "The distributions of a dataset",
          "description": "Specifies the list of distributions of a dataset.",
          "type": "object",
          "properties": {
            "record_test": {
              "title": "Record.",
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


  case class RecordProjectorAttributes(attributes: List[String], aspects: List[String], includeAspectsList: Boolean)

  def extractAttributesAndAspects(prj: Vector[ProjectedName]): List[String] = {
    println("Aspects to be fetched: " + prj.find(_.name == "aspects").map(_.children.toList.map(_.name)).getOrElse(Nil))
    // prj.find(_.name == "records").map(prjName => RecordProjectorAttributes(
    //   Nil,
    //   prjName.children.find(_.name == "aspects").map(_.children.toList.map(_.name)).getOrElse(Nil),
    //   prjName.children.exists(_.name == "aspectsList")
    // ))
    prj.find(_.name == "aspects").map(_.children.toList.map(_.name)).getOrElse(Nil)
  }


  def isRecordLink(link: JsObject): Boolean = {
    link.getFields("href", "rel") match {
      case Seq(JsString(href), JsString(rel)) => href == "/api/v0/registry/records/{$}" && rel == "item"
      case _ => false
    }
  }


  // Fix below protocol by merging the case matches
  // Currently, each level of recursion:
  // - Constructs a type definition of it's own object/list/primitive - 1st match
  // - In the case of an object or list, this construction involves:
  //   - constructing the type of the next level's object/list/primitive
  //   - and making resolvers for the next level - 2nd match, one level down
  //     + Resolvers are only needed below an ObjectType, so if the matches are combined, resolvers will be generated for everything, but it's only needed for Objects
  //     + Constructing the type requires context 1 level down (does it?)
  // - Maybe remove Options and other catches until everything is working (just make default a string type or whatever)


  object AspectJsonProtocol extends DefaultJsonProtocol {
//    def makeResolver(name: String, outputType: OutputType[_]): (Context[GraphQLDataFetcher, JsObject] => Action[GraphQLDataFetcher, _]) = {
//      // Fetch correct field of parent JsObject and treat it according to the field type
//      outputType match {
//        case StringType => _.value.fields.get(name).map(_.convertTo[String])
//        case IntType => _.value.fields.get(name).map(_.convertTo[Int])
////        case ListType(_) => _.value.fields.get(name).map(_.convertTo[List[JsValue]])
////        case ObjectType(_,_,_,_,_,_) => _.value.fields.get(name).map(_.asJsObject)
//        // case RecordType => Projector((ctx: Context[GraphQLDataFetcher, JsObject], prj) => ctx.value.fields.get(name).map(id => {
//        //   val projectorAttrs = extractAttributesAndAspects(prj)
//        //   ctx.ctx.getRecord(id.convertTo[String], projectorAttrs.aspects)
//        // }))
//        case _ => (_ => None)
//      }
//    }
//
//    def constructField(name: String, outType: OutputType[_]): Field[GraphQLDataFetcher, JsObject] = {
//      Field(name, OptionType(outType), resolve = makeResolver(name, outType))
//    }
//
//    def constructObjectSchemaDefinition(path: String, schema: JsObject): Option[OutputType[_]] = {
//      schema.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList.flatMap({
//        case (name, childSchema) => constructSchemaDefinition(path + "_" + name, schema.asJsObject).map(outType => constructField(name, outType))
//      })).map(x => ObjectType(path, fields[GraphQLDataFetcher, JsObject](x:_*)))
//    }

//     def constructSchemaDefinition(path: String, schema: JsObject): Option[OutputType[_]] = {
//       println(path)
//       schema.getFields("type", "links") match {
// //        case Seq(_, JsArray(links)) => if (links.exists(x => isRecordLink(x.asJsObject))) Some(RecordType) else None
//         case Seq(JsString("string"), _) => Some(StringType)
//         case Seq(JsString("integer"), _) => Some(IntType)
// //        case Seq(JsString("array"), _) => schema.fields.get("items").map(_.asJsObject).flatMap(x => constructSchemaDefinition(path + "_items", x)).map(x => ListType(x))
// //        case Seq(JsString("object"), _) => constructObjectSchemaDefinition(path, schema)
//         case _ => None
//       }
//       // schema.fields.get("type").flatMap(x => JsonSchemaType.withNameInsensitiveOption(x.convertTo[String].toUpperCase)).flatMap({
//       //   case JsonSchemaType.String => Some(StringType)
//       //   case JsonSchemaType.Integer => Some(IntType)
//       //   case JsonSchemaType.Array => schema.fields.get("items").map(_.asJsObject).flatMap(x => constructSchemaDefinition(path + "_items", x)).map(x => ListType(x))
//       //   case JsonSchemaType.Object => schema.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList.flatMap({
//       //     case (name, schema) => constructSchemaDefinition(path + "_" + name, schema.asJsObject).map(outType => constructField(name, outType))
//       //   })).map(x => ObjectType(path, fields[GraphQLDataFetcher, JsObject](x:_*)))
//       //   case _ => None

//       // })
//     }

    def determineType(schema: JsObject): String = {
      val typeStr: String = schema.fields("type").convertTo[String]
      schema.fields.get("links").flatMap(links => if (links.convertTo[List[JsObject]].exists(isRecordLink)) Some("record") else None).getOrElse(typeStr)
    }

    def constructJsonField(name: String, path: String,  schema: JsObject): Field[GraphQLDataFetcher, Map[String, JsValue]] = {
      val jsType = determineType(schema)
      println("Type is '" + jsType + "' with schema: " + schema)
      jsType match {
        case "string" => Field(name, OptionType(StringType), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[String]))
        case "integer" => Field(name, OptionType(IntType), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[Int]))
        case "array" => determineType(schema.fields("items").asJsObject) match {
          case "string" => Field(name, OptionType(ListType(StringType)), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap(_ match {
            case JsNull => None
            case arr: JsArray => Some(arr.convertTo[List[String]])
          }))
          case "integer" => Field(name, OptionType(ListType(IntType)), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap(_ match {
            case JsNull => None
            case arr: JsArray => Some(arr.convertTo[List[Int]])
          }))
          case "object" => {
            val propFields = schema.fields("items").asJsObject.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList).getOrElse(Nil).map({
              case (propName, propSchema) => constructJsonField(propName, path + "_" + propName, propSchema.asJsObject)
            })
            Field(name, OptionType(ListType(ObjectType(path, fields(propFields:_*)))), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap(_ match {
              case JsNull => None
              case arr: JsArray => Some(arr.convertTo[List[Map[String, JsValue]]])
            }))
          }
          //case "record"  =>
          case t => throw new RuntimeException("type " + t + " in array not recognised")
        }
        case "object" => {
          val propFields = schema.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList).getOrElse(Nil).map({
            case (propName, propSchema) => constructJsonField(propName, path + "_" + propName, propSchema.asJsObject)
          })
          Field(name, OptionType(ObjectType(path, fields(propFields:_*))), resolve = (ctx: Context[GraphQLDataFetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[Map[String, JsValue]]))
        }
        case "record" => Field(name, OptionType(RecordType), resolve =  Projector((ctx: Context[GraphQLDataFetcher, Map[String, JsValue]], prj) => {
          ctx.value.get(name).map(id => ctx.ctx.getRecord(id.convertTo[String], extractAttributesAndAspects(prj)))
        }))
        case t => throw new RuntimeException("type " + t + " not recognised")

        // Problem with "array":
        // - Need to make an OptionType(ListType(something)) and also have a custom resolver
        // - Could detect array type from outside the function and pass in the inner type, but I'll still need to duplicate the whole match block inside of array
        //   + Just do this for now and refactor later
        // - Maybe generate fieldType and resolve above in a match on base type (the type under list), then apply ListType and convertTo[List[JsValue]] followed by original conversion (in map) for "array" fields
        //   + This will probably make both fieldType and resolve Any types, so maybe they'll still match?
        // - Check out object types before making any further changes, to make sure the approach will work with objects
      }

    }
    // implicit val aspectFormat = jsonFormat(Aspect, "name", "schema")
    // implicit val aspectsFormat = jsonFormat(Aspects, "aspects")
  }

  import AspectJsonProtocol._

  val a: List[OutputType[_]] = List(StringType, IntType, ListType(StringType), RecordType)


  case class Record(id: String, name: String, aspectsList: List[String], aspects: Map[String, JsValue])
  // might want to change aspects to a Map[String, JsValue sometime]

  lazy val RecordType = ObjectType(
    "Record",
    () => fields[GraphQLDataFetcher, Record](
      Field("id", StringType, resolve = _.value.id),
      Field("name", StringType, resolve = _.value.name),
      Field("aspectsList", ListType(StringType), resolve = _.value.aspectsList),
      Field("aspects", Aspects, resolve = _.value.aspects) //, tags = ProjectionExclude :: Nil)
    )
  )

  case class RecordsPageGraphQL(records: List[Record], nextPageToken: String)

  val RecordsPageGraphQLType = ObjectType("RecordsPage", fields[GraphQLDataFetcher,RecordsPageGraphQL](
    Field("records", ListType(RecordType), resolve = _.value.records),
    Field("nextPageToken", StringType, resolve = _.value.nextPageToken)
  ))



  val PageTokenArg = Argument("pageToken", OptionInputType(StringType))
  val RequiredAspectsArg = Argument("requiredAspects", ListInputType(StringType))
  val Query = ObjectType(

    "Query", fields[GraphQLDataFetcher, Unit](
      Field("allRecords", RecordsPageGraphQLType,
        arguments = List(PageTokenArg, RequiredAspectsArg),
        resolve = _ => RecordsPageGraphQL(List(Record("test0", "Test dataset", List("Aspect_test_record_link"), Map("test_record_link" -> """{"record_test": "0"}""".parseJson))), "0")
//          Projector((ctx,prj) => {
//
//          prj.foreach { x => println(x.asVector) }
////          ctx.ctx.getRecordsPage(ctx.arg(PageTokenArg))
//          RecordsPageGraphQL(List(Record("test0", "Test dataset", List("Aspect_test_record_link"), Map("test_record_link" -> """{"record_test": "0"}""".parseJson))), "0")
//        })
      )
    )
  )

  val aspectFields = source.parseJson.asJsObject.fields("aspects").convertTo[List[JsValue]].map(_.asJsObject.getFields("name", "schema") match {
    case Seq(JsString(name), schema) => {
      val cleanedName = name.replaceAll("^([0-9])|[^A-Za-z0-9_]", "_$1") // Replace leading digit with _digit and any other characters with _
      constructJsonField(cleanedName, "Aspect_" + cleanedName, schema.asJsObject)
    }
    case _ => throw new RuntimeException("aspect not well defined")
  })
  val Aspects = ObjectType(
    "Aspects",
    fields[GraphQLDataFetcher, Map[String, JsValue]](aspectFields:_*)
  )

  val MagdaSchema = Schema(Query)
}
