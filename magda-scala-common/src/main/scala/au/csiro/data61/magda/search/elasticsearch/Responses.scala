package au.csiro.data61.magda.search.elasticsearch.Responses

import com.fasterxml.jackson.annotation.JsonProperty
import scala.concurrent.duration._

//--- We need our own response Class as elastic4s current one missing `Shards` info

case class Shards(@JsonProperty("total") total: Long,
                  @JsonProperty("failed") failed: Long,
                  @JsonProperty("successful") successful: Long
                 )
case class GetSnapshotResponse(snapshots: Seq[Snapshot])
case class Snapshot(snapshot: String,
                    uuid: String,
                    @JsonProperty("version_id") versionId: String,
                    version: String,
                    indices: Seq[String],
                    state: String,
                    @JsonProperty("start_time") startTime: String,
                    @JsonProperty("start_time_in_millis") startTimeInMillis: Long,
                    @JsonProperty("end_time") endTime: String,
                    @JsonProperty("end_time_in_millis") endTimeInMillis: Long,
                    @JsonProperty("duration_in_millis") durationInMillis: Long,
                    @JsonProperty("shards") shards: Shards
                   ) {
  def duration: Duration = durationInMillis.millis
}

case class CreateSnapshotResponse(snapshot:Snapshot)
