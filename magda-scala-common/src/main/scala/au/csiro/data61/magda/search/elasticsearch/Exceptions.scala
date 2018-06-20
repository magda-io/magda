package au.csiro.data61.magda.search.elasticsearch.Exceptions

import com.sksamuel.elastic4s.http.RequestFailure


  object RepositoryMissingException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case "repository_missing_exception" => Some(new RuntimeException(s"""${failure.error.`type`}: ${failure.error.reason}"""))
        case _ => None
      }
    }
  }

  object InvalidSnapshotNameException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case "invalid_snapshot_name_exception" => Some(new RuntimeException(s"""${failure.error.`type`}: ${failure.error.reason}"""))
        case _ => None
      }
    }
  }

  object ESGenericException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case _ => Some(new RuntimeException(s"""${failure.error.`type`}: ${failure.error.reason}"""))
      }
    }
  }
