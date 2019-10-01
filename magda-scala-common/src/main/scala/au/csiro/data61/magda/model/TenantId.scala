package au.csiro.data61.magda.model

object TenantId {
  sealed trait TenantId
  case object AllTenantsId extends TenantId {
    override def toString: String = {
      throw new Exception(
        "Called toString() on AllTenants. This is not allowed because it probably means you've interpolated this into SQL as if it were a tenant id (WHICH IS IS NOT!!!111)"
      )
    }
  }
  case class SpecifiedTenantId(tenantId: BigInt) extends TenantId {
    override def toString: String = {
      tenantId.toString
    }
  }
}
