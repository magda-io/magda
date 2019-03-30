package au.csiro.data61.magda.registry

import java.sql.SQLException

import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, Tenant}
import gnieh.diffson.sprayJson._
import scalikejdbc._
import spray.json._

import scala.util.{Failure, Try}

trait TenantPersistence {
  def getTenants(implicit session: DBSession): List[Tenant]
  def getByDomainName(implicit session: DBSession, domainName: String): Option[Tenant]
  def createTenant(implicit session: DBSession, tenant: Tenant): Try[Tenant]
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

  def createTenant(implicit session: DBSession, tenant: Tenant): Try[Tenant] = {
    for {
      eventId <- Try {
        val eventJson = CreateTenantEvent(tenant).toJson.compactPrint
        sql"insert into Events (eventTypeId, userId, tenantId, data) values (${CreateTenantEvent.Id}, 0, $MAGDA_ADMIN_PORTAL_ID, $eventJson::json)".updateAndReturnGeneratedKey.apply()
      }
      _ <- Try {
        sql"""insert into Tenants (domainName, enabled, lastUpdate) values (${tenant.domainName}, true, $eventId)""".update.apply()
      } match {
        case Failure(e: SQLException) if e.getSQLState().substring(0, 2) == "23" =>
          Failure(new RuntimeException(s"Cannot create tenant '${tenant.domainName}' because a tenant with that domain name already exists."))
        case anythingElse => anythingElse
      }

      maybeTenant <- Try {
        sql"""select domainName, id, enabled from Tenants where domainName=${tenant.domainName}""".map(rowToTenant).single.apply()
      }

      createdTenant = Tenant(maybeTenant.get.domainName, maybeTenant.get.id, maybeTenant.get.enabled)
    } yield createdTenant
  }

  private def rowToTenant(rs: WrappedResultSet): Tenant = {
    Tenant(rs.string("domainName"), rs.bigInt("id"), rs.boolean("enabled"))
  }
}
