package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry.Tenant

case class CreateTenantEvent(tenant: Tenant) extends TenantEvent

object CreateTenantEvent {
  val Id = 10 // from EventTypes table
}
