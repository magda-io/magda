package au.csiro.data61.magda.directives

import akka.http.scaladsl.model.headers
import akka.http.scaladsl.server.Directives.{extractRequest, provide, reject}
import akka.http.scaladsl.server.{Directive1, MissingHeaderRejection, ValidationRejection}
import au.csiro.data61.magda.model.Registry.{MAGDA_TENANT_ID_HEADER, MAGDA_ADMIN_PORTAL_ID}

object TenantDirectives {
  def requiredTenantId: Directive1[BigInt] = {
    extractRequest flatMap {request =>
      val sessionToken =   request.headers.find{
        case headers.RawHeader(MAGDA_TENANT_ID_HEADER, _) => true
        case _ => false
      }

      sessionToken match {
        case Some(header) => provide(BigInt(header.value()))
        case None =>
          val msg = s"Could not find $MAGDA_TENANT_ID_HEADER header in request"
          reject(MissingHeaderRejection(msg))
      }
    }
  }

  def requiredAdminTenantId: Directive1[BigInt] = {
    requiredTenantId flatMap {tenantId =>
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
