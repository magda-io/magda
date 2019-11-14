package au.csiro.data61.magda.opa

import org.scalatest.Ignore

@Ignore
class TestRecordEsriPolicyWithGroupsOnly
    extends RecordOpaPolicyWithEsirGroupsOrMagdaOrgUnitsOnlySpec
    with GroupsJwtForRecordEsriOpaPolicyTest {

  override def beforeAll(): Unit = {
    super.beforeAll()
    testRecords = getTestRecords(
      dataPath + "add-esri-access-control-aspect-groups-only.json"
    )
  }

}
