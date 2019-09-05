package au.csiro.data61.magda.opa

import org.scalatest.Ignore

@Ignore
class RecordsWithOwnerOrgUnitsOpaPoliciesSpec extends RecordsOpaSpec {
  override def testConfigSource =
    s"""
       |opa.recordPolicyId="object.registry.record.owner_orgunit"
    """.stripMargin

  override def beforeAll() = {
    super.beforeAll()
    testRecords = getTestRecords(dataPath + "records.json")
  }

}
