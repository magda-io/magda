package au.csiro.data61.magda.registry

import sangria.schema._
import spray.json._
// import enumeratum._
// import sangria.marshalling.FromInput


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

  // sealed abstract class JsonSchemaType(override val entryName: String) extends EnumEntry
  // object JsonSchemaType extends Enum[JsonSchemaType] {
  //   val values = findValues
  //   case object String extends JsonSchemaType("string")
  //   case object Integer extends JsonSchemaType("integer")
  //   case object Array extends JsonSchemaType("array")
  //   case object Object extends JsonSchemaType("object")
  // }


  case class RecordProjectorAttributes(attributes: List[String], aspects: List[String], includeAspectsList: Boolean)

  def extractAttributesAndAspects(prj: Vector[ProjectedName]): List[String] = {
    val aspects = prj.find(_.name == "aspects").map(_.children.toList.map(_.name).filterNot(_.startsWith("__"))).getOrElse(Nil)
    // prj.find(_.name == "records").map(prjName => RecordProjectorAttributes(
    //   Nil,
    //   prjName.children.find(_.name == "aspects").map(_.children.toList.map(_.name)).getOrElse(Nil),
    //   prjName.children.exists(_.name == "aspectsList")
    // ))
    aspects
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

    def determineType(schema: JsObject): String = {
      val typeStr: String = schema.fields("type").convertTo[String]
      schema.fields.get("links").flatMap(links => if (links.convertTo[List[JsObject]].exists(isRecordLink)) Some("record") else None).getOrElse(typeStr)
    }

    // Doesn't deal with JsNulls well (only when in place of a JsArray, which is probably the least likely place)
    def constructJsonField(name: String, path: String,  schema: JsObject): Field[GraphQLDataConnection.Fetcher, Map[String, JsValue]] = {
      val jsType = determineType(schema)
      jsType match {
        case "string" => Field(name, OptionType(StringType), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[String]))
        case "integer" => Field(name, OptionType(IntType), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[Int]))
        case "array" => determineType(schema.fields("items").asJsObject) match {
          case "string" => Field(name, OptionType(ListType(StringType)), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap({
            case JsNull => None
            case arr: JsArray => Some(arr.convertTo[List[String]])
          }))
          case "integer" => Field(name, OptionType(ListType(IntType)), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap({
            case JsNull => None
            case arr: JsArray => Some(arr.convertTo[List[Int]])
          }))
          case "object" => {
            val propFields = schema.fields.get("items").map(_.asJsObject.fields("properties").asJsObject.convertTo[Map[String, JsValue]].toList.map({
              case (propName, propSchema) => constructJsonField(propName, path + "_" + propName, propSchema.asJsObject)
            })).getOrElse(List(
              Field("json", StringType, resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.toJson.compactPrint)
            ))
            Field(name, OptionType(ListType(ObjectType(path, fields(propFields:_*)))), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).flatMap({
              case JsNull => None
              case arr: JsArray => Some(arr.convertTo[List[Map[String, JsValue]]])
            }))
          }
          case "record" => Field(name, OptionType(ListType(RecordType)), resolve =  Projector((ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]], prj) => {
            ctx.value.get(name).flatMap({
              case JsNull => None
              case JsArray(vec) => Some(vec.map(id => ctx.ctx.getRecord(id.convertTo[String], extractAttributesAndAspects(prj))).toList)
            })
          }))
          case t => throw new RuntimeException("type " + t + " in array not recognised")
        }
        case "object" => {
          // If there are properties, expand and "schemarise" them, otherwise make a field "json" to make the stringified JSON representation of the object available
          val propFields = schema.fields.get("properties").map(_.asJsObject.convertTo[Map[String, JsValue]].toList.map({
              case (propName, propSchema) => constructJsonField(propName, path + "_" + propName, propSchema.asJsObject)
          })).getOrElse(List(
            Field("json", StringType, resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.toJson.compactPrint)
          ))
          Field(name, OptionType(ObjectType(path, fields(propFields:_*))), resolve = (ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]]) => ctx.value.get(name).map(_.convertTo[Map[String, JsValue]]))
          //}).getOrElse(Field(name, OptionType(StringType), resolve = ctx => ctx.value.get(name).map(_.compactPrint)))
        }
        case "record" => Field(name, OptionType(RecordType), resolve =  Projector((ctx: Context[GraphQLDataConnection.Fetcher, Map[String, JsValue]], prj) => {
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

    // Similar to above, but construct aspect filter instead
    def constructFilterType(name: String, path: String, schema: JsObject): InputType[_] = {
      determineType(schema) match {
        case "string" => StringType
        case "integer" => IntType
        case "array" => ListInputType(OptionInputType(constructFilterType(name, path, schema.fields("items").asJsObject)))
        case "object" => InputObjectType[JsValue](
          path,
          schema.fields("properties").asJsObject.convertTo[Map[String, JsValue]].toList.map({
            case (propName, propSchema) => constructFilterInputField(propName, path + "_" + propName, propSchema.asJsObject)
          })
        )
        case "record" => RecordFilterType
      }
    }

    def constructFilterInputField(name: String, path: String, schema: JsObject): InputField[_] = {
      InputField(name, OptionInputType(constructFilterType(name, path, schema)))
    }
    // implicit val aspectFormat = jsonFormat(Aspect, "name", "schema")
    // implicit val aspectsFormat = jsonFormat(Aspects, "aspects")
  }

  import AspectJsonProtocol._

  // val a: List[OutputType[_]] = List(StringType, IntType, ListType(StringType), RecordType)

  // val b = List(StringType, IntType, ListInputType(StringType), OptionInputType(IntType))

  lazy val RecordType = ObjectType(
    "Record",
    () => fields[GraphQLDataConnection.Fetcher, GraphQLTypes.Record](
      Field("id", IDType, resolve = _.value.id),
      Field("name", StringType, resolve = _.value.name),
      Field("aspectsList", ListType(StringType), resolve = _.value.aspectsList),
      Field("aspects", Aspects, resolve = _.value.aspects) //, tags = ProjectionExclude :: Nil)
    )
  )

//  val aspectFields = source.parseJson.asJsObject.fields("aspects").convertTo[List[JsValue]].map(_.asJsObject.getFields("name", "schema") match {
//    case Seq(JsString(name), schema) => {
//      val cleanedName = name.replaceAll("^([0-9])|[^A-Za-z0-9_]", "_$1") // Replace leading digit with _digit and any other characters with _
//      constructJsonField(cleanedName, "Aspect_" + cleanedName, schema.asJsObject)
//    }
//    case _ => throw new RuntimeException("aspect not well defined")
//  })
  def test(x: (String, JsObject)) = x match {
    case (id, schema) => try {
      Some(constructJsonField(id, "Aspect_" + id, schema))
    } catch {
      case e: Exception => {
        println("Failed to process aspect '" + id + "': " + schema + " (" + e.getMessage() + ")")
      }
      None
    }
  }

  val aspectFields = GraphQLDataConnection.aspects.flatMap {
    case (id, schema) => try {
      Some(constructJsonField(id, "Aspect_" + id, schema))
    } catch {
      case e: Exception => {
        println("Failed to process aspect '" + id + "': " + schema + " (" + e.getMessage() + ")")
      }
      None
    }
  }
  val Aspects = ObjectType(
    "Aspects",
    fields[GraphQLDataConnection.Fetcher, Map[String, JsValue]](aspectFields:_*)
  )

  val RecordsPageGraphQLType = ObjectType("RecordsPage", fields[GraphQLDataConnection.Fetcher, GraphQLTypes.RecordsPageGraphQL](
    Field("records", ListType(RecordType), resolve = _.value.records),
    Field("nextPageToken", OptionType(StringType), resolve = _.value.nextPageToken),
    Field("totalCount", IntType, resolve = _.value.totalCount)
  ))

  // Input types (for filtering, and page token)
  def createAspectFilter(id: String, schema: JsObject): Option[InputField[_]] = {
    try {
      Some(constructFilterInputField(id, "AspectFilter_" + id, schema))
    } catch {
      case e: Exception => {
        println("Failed to process aspect '" + id + "': " + schema + " (" + e.getMessage() + ") for input")
      }
      None
    }
  }
  val aspectInputFields = GraphQLDataConnection.aspects.flatMap {
    case (id, schema) => createAspectFilter(id, schema)
  }

  val AspectsFilterType = InputObjectType[Map[String, JsValue]]("AspectsFilter", aspectInputFields)
  // Make an input type for record filter and deliver it to resolver functions as a JsValue. Requries sangria sprayJson marshalling
  lazy val RecordFilterType = InputObjectType[GraphQLTypes.RecordFilter]("RecordFilter", () => List(
//    InputField("AND", OptionInputType(ListInputType(RecordFilterType))),
//    InputField("OR", OptionInputType(ListInputType(RecordFilterType))),
    InputField("id", OptionInputType(StringType)),
    InputField("aspects", OptionInputType(AspectsFilterType))
  ))

  object RecordFilterTypeJsonProtocol extends DefaultJsonProtocol {
    implicit val recordFilterFormat = jsonFormat2(GraphQLTypes.RecordFilter.apply)
  }

  val RecordFilterArg = {
    import RecordFilterTypeJsonProtocol._
    import sangria.marshalling.sprayJson.sprayJsonReaderFromInput
    Argument("filter", OptionInputType(RecordFilterType))
  }

  val PageTokenArg = Argument("pageToken", OptionInputType(StringType))
//  val RequiredAspectsArg = Argument("requiredAspects", ListInputType(StringType))

  val IdArg = Argument("id", IDType)
  val Query = ObjectType(
    "Query", fields[GraphQLDataConnection.Fetcher, Unit](
      Field("allRecords", RecordsPageGraphQLType,
        arguments = List(PageTokenArg, RecordFilterArg),
        resolve = Projector((ctx: Context[GraphQLDataConnection.Fetcher, Unit], prj) => {
          println("\nProjector: " + prj)
          ctx.ctx.getRecordsPage(ctx.arg(PageTokenArg), ctx.arg(RecordFilterArg), prj.find(_.name == "records").map(recordPrj => extractAttributesAndAspects(recordPrj.children)).getOrElse(Nil))
        })

        //GraphQLTypes.RecordsPageGraphQL(List(GraphQLTypes.Record("test0", "Test dataset", List("Aspect_test_record_link"), Map("test_record_link" -> """{"record_test": "0e2d5d23-d0c9-4c7f-807f-2d5157be6828"}""".parseJson))), "0")
//          Projector((ctx,prj) => {
//
//          prj.foreach { x => println(x.asVector) }
////          ctx.ctx.getRecordsPage(ctx.arg(PageTokenArg))
//          RecordsPageGraphQL(List(Record("test0", "Test dataset", List("Aspect_test_record_link"), Map("test_record_link" -> """{"record_test": "0"}""".parseJson))), "0")
//        })
      ),
      Field("Record", RecordType,
        arguments = List(IdArg),
        resolve = Projector((ctx: Context[GraphQLDataConnection.Fetcher, Unit], prj) => {
          ctx.ctx.getRecord(ctx.arg(IdArg), extractAttributesAndAspects(prj))
        })
      )
    )
  )



  val MagdaSchema = Schema(Query)
}
