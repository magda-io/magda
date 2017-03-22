package au.csiro.data61.magda.registry

import enumeratum.values.{IntEnum, IntEnumEntry}

sealed abstract class EventType(val value: Int, val name: String) extends IntEnumEntry

case object EventType extends IntEnum[EventType] {
  case object CreateRecord extends EventType(0, "Create Record")
  case object CreateAspectDefinition extends EventType(1, "Create Aspect Definition")
  case object CreateRecordAspect extends EventType(2, "Create Record Aspect")
  case object PatchRecord extends EventType(3, "Patch Record")
  case object PatchAspectDefinition extends EventType(4, "Patch Aspect Definition")
  case object PatchRecordAspect extends EventType(5, "Patch Record Aspect")
  case object DeleteRecord extends EventType(6, "Delete Record")
  case object DeleteAspectDefinition extends EventType(7, "Delete Aspect Definition")
  case object DeleteRecordAspect extends EventType(8, "Delete Record Aspect")

  val values = findValues
}
