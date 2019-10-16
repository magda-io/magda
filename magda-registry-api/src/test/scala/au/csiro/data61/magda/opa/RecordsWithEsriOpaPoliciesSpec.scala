package au.csiro.data61.magda.opa

import org.scalatest.Ignore

@Ignore
class RecordsWithEsriOpaPoliciesSpec extends RecordsOpaSpec {
  override def testConfigSource: String =
    s"""
       |opa.recordPolicyId="object.registry.record.esri_owner_groups"
    """.stripMargin

  override def beforeAll(): Unit = {
    super.beforeAll()
    testRecords = getTestRecords(dataPath + "add-esri-access-control-aspect.json")
  }

}
