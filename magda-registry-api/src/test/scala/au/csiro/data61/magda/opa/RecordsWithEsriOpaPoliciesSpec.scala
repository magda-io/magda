package au.csiro.data61.magda.opa

import org.scalatest.Ignore

@Ignore
class RecordsWithEsriOpaPoliciesSpec extends RecordsOpaSpec {
  override def testConfigSource =
    s"""
       |opa.recordPolicyId="object.registry.record.esri_groups"
    """.stripMargin

  override def beforeAll() = {
    super.beforeAll()
    testRecords = getTestRecords(dataPath + "esri-records.json")
  }

}
