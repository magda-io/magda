package au.csiro.data61.magda.registry

object ColumnNamePrefixType extends Enumeration {
  type ColumnNamePrefixType
  val PREFIX_TEMP: ColumnNamePrefixType.Value = Value(0, "temp")
  val PREFIX_EMPTY: ColumnNamePrefixType.Value = Value(1, "")
}
