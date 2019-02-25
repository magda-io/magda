package au.csiro.data61.magda.registry

import au.csiro.data61.magda.model.Registry.Tenant

trait TenantEvent {
  def tenant: Tenant
}
