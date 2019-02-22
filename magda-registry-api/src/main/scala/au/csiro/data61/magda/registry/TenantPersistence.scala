package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry.{Record, Tenant}
import gnieh.diffson.sprayJson._
import scalikejdbc._
import spray.json.JsonParser

trait TenantPersistence {
  def getTenants(implicit session: DBSession): List[Tenant]
  def getByDomainName(implicit session: DBSession, domainName: String): Option[Tenant]
}

object DefaultTenantPersistence extends Protocols with DiffsonProtocol with TenantPersistence {
  val maxResultCount = 1000
  val defaultResultCount = 1

  def getTenants(implicit session: DBSession): List[Tenant] = {
    sql"""select * from Tenants""".map(rowToTenant).list.apply()
  }

  def getByDomainName(implicit session: DBSession, domainName: String): Option[Tenant] = {
    sql"""select * from Tenants where domainName=$domainName""".map(rowToTenant).single.apply()
  }

  private def rowToTenant(rs: WrappedResultSet): Tenant = {
    Tenant(rs.string("domainName"), rs.bigInt("id"))
  }
}
