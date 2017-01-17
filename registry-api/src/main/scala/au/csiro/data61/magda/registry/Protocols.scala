package au.csiro.data61.magda.registry

import gnieh.diffson.FormatException
import spray.json.{DefaultJsonProtocol, JsArray, JsValue, RootJsonFormat}
import gnieh.diffson.sprayJson._

trait Protocols extends DefaultJsonProtocol with DiffsonProtocol {
  // We need this because gnieh.diffson.sprayjson.DiffsonProtocol.JsonPatchFormat incorrectly
  // extends JsonFormat instead of RootJsonFormat, even though its type (an Array) is a perfectly
  // valid root JSON object.  Without this, unmarshalling an HttpEntity to a JsonPatch will fail.
  // https://github.com/gnieh/diffson/pull/38
  implicit def Foo(implicit pointer: JsonPointer): RootJsonFormat[JsonPatch] =
    new RootJsonFormat[JsonPatch] {

      def write(patch: JsonPatch): JsArray =
        JsArray(patch.ops.map(_.toJson).toVector)

      def read(value: JsValue): JsonPatch = value match {
        case JsArray(ops) =>
          new JsonPatch(ops.map(_.convertTo[Operation]).toList)
        case _ => throw new FormatException("JsonPatch expected")
      }

    }

  implicit val badRequestFormat = jsonFormat1(BadRequest.apply)
  implicit val sectionFormat = jsonFormat3(Section.apply)
  implicit val recordFormat = jsonFormat3(Record.apply)
  implicit val recordSummaryFormat = jsonFormat3(RecordSummary.apply)
  implicit val patchSectionDefinitionEventFormat = jsonFormat2(PatchSectionDefinitionEvent.apply)
  implicit val createSectionDefinitionEventFormat = jsonFormat1(CreateSectionDefinitionEvent.apply)
  implicit val createRecordEventFormat = jsonFormat2(CreateRecordEvent.apply)
  implicit val createRecordSectionEventFormat = jsonFormat3(CreateRecordSectionEvent.apply)
  implicit val patchRecordEventFormat = jsonFormat2(PatchRecordEvent.apply)
  implicit val patchRecordSectionEventFormat = jsonFormat3(PatchRecordSectionEvent.apply)
}