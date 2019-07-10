package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry.{AspectDefinition, MAGDA_ADMIN_PORTAL_ID, MAGDA_SYSTEM_ID}
import scalikejdbc.DB
import spray.json.JsObject

class AspectPersistenceSpec extends ApiSpec {
  it("filter aspect by tenant id") {_ =>
    val a = AspectDefinition(id = "a test aspect id", name = "a test aspect name", jsonSchema = Some(JsObject()))
    DB localTx { implicit session => AspectPersistence.create(session, a, TENANT_1) }

    val responseToOwner = DB readOnly {
      implicit session => AspectPersistence.getByIds(session, List(a.id), TENANT_1)}
    responseToOwner shouldEqual List(a)

    val responseToSystemId = DB readOnly {
      implicit session => AspectPersistence.getByIds(session, List(a.id), MAGDA_SYSTEM_ID)}
    responseToSystemId shouldEqual List(a)

    val responseToOtherTenant = DB readOnly {
      implicit session => AspectPersistence.getByIds(session, List(a.id), MAGDA_ADMIN_PORTAL_ID)}

    responseToOtherTenant shouldEqual Nil
  }
}
