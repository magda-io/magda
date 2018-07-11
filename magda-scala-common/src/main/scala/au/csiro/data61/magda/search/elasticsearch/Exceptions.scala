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

  object IndexNotFoundException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case "index_not_found_exception" => Some(new RuntimeException(s"""${failure.error.`type`}: ${failure.error.reason}"""))
        case _ => None
      }
    }
  }

  object IllegalArgumentException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case "illegal_argument_exception" => Some(new java.lang.IllegalArgumentException(failure.error.reason))
        case _ => None
      }
    }
  }

  object ResourceAlreadyExistsException{
    def unapply(failure: RequestFailure): Option[RuntimeException] = {
      failure.error.`type` match {
        case "resource_already_exists_exception" => Some(new RuntimeException(s"""${failure.error.`type`}: ${failure.error.reason}"""))
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
