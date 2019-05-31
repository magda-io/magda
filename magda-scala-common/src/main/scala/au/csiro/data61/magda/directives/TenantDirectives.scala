package au.csiro.data61.magda.directives

import akka.http.scaladsl.model.headers
import akka.http.scaladsl.server.Directives.{extractRequest, provide, reject}
import akka.http.scaladsl.server.{Directive1, MissingHeaderRejection, ValidationRejection}
import au.csiro.data61.magda.model.Registry.{MAGDA_ADMIN_PORTAL_ID, MAGDA_TENANT_ID_HEADER}

object TenantDirectives {
  private val magda_tenant_id_header_in_lower_cases = MAGDA_TENANT_ID_HEADER.toLowerCase()
  private val magda_tenant_id_header_in_upper_cases = MAGDA_TENANT_ID_HEADER.toUpperCase()

  /***
    * Some libraries may automatically change request header names into lower cases.
    * Here we only accept three forms: Original cases, all lower cases and all upper cases.
    * Any other combinations will be rejected.
    */
  def requiresTenantId: Directive1[BigInt] = {
    extractRequest flatMap {request =>
      val tenantIdToken =   request.headers.find{
        case headers.RawHeader(`MAGDA_TENANT_ID_HEADER`, _) => true
        case headers.RawHeader(`magda_tenant_id_header_in_lower_cases`, _) => true
        case headers.RawHeader(`magda_tenant_id_header_in_upper_cases`, _) => true
        case _ => false
      }

      tenantIdToken match {
        case Some(header) => provide(BigInt(header.value()))
        case None =>
          val msg = s"Could not find $MAGDA_TENANT_ID_HEADER header in request"
          reject(MissingHeaderRejection(msg))
      }
    }
  }

  /***
    * Some libraries may automatically change request header names into lower cases.
    * Here we only accept three forms: Original cases, all lower cases and all upper cases.
    * Any other combinations will be rejected.
    */
  def requiresAdminTenantId: Directive1[BigInt] = {
    requiresTenantId flatMap { tenantId =>
      if (tenantId == MAGDA_ADMIN_PORTAL_ID) {
        provide(tenantId)
      }
      else {
        val msg = s"The operation is not allowed because $tenantId is not a magda admin ID."
        reject(ValidationRejection(msg))
      }
    }
  }
}
