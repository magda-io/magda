package au.csiro.data61.magda.directives

import akka.http.scaladsl.server.Directives.{extractRequest, provide, reject}
import akka.http.scaladsl.server.{
  Directive1,
  MissingHeaderRejection,
  ValidationRejection
}
import au.csiro.data61.magda.model.RegistryModel.{
  MAGDA_ADMIN_PORTAL_ID,
  MAGDA_TENANT_ID_HEADER
}

object TenantDirectives {

  def requiresTenantId: Directive1[BigInt] = {
    extractRequest flatMap { request =>
      val tenantIdToken = request.headers.find(
        header => header.lowercaseName() == MAGDA_TENANT_ID_HEADER.toLowerCase()
      )

      tenantIdToken match {
        case Some(header) => provide(BigInt(header.value()))
        case None =>
          val msg = s"Could not find $MAGDA_TENANT_ID_HEADER header in request"
          reject(MissingHeaderRejection(msg))
      }
    }
  }

  def requiresAdminTenantId: Directive1[BigInt] = {
    requiresTenantId flatMap { tenantId =>
      if (tenantId == MAGDA_ADMIN_PORTAL_ID) {
        provide(tenantId)
      } else {
        val msg =
          s"The operation is not allowed because $tenantId is not a magda admin ID."
        reject(ValidationRejection(msg))
      }
    }
  }
}
