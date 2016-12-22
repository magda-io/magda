package au.csiro.data61.magda.search.elasticsearch

import com.sksamuel.elastic4s.{ElasticClient, Executable, RichSearchResponse, SearchDefinition}
import org.elasticsearch.client.{AdminClient, Client}

import scala.concurrent.Future
import scala.concurrent.duration.Duration

trait ElasticClientTrait {
  def execute[T, R, Q](t: T)(implicit executable: Executable[T, R, Q]): Future[Q]
  def close(): Unit
  def java: Client
  def admin: AdminClient
  def iterateSearch(query: SearchDefinition)(implicit timeout: Duration): Iterator[RichSearchResponse]
}

class ElasticClientAdapter(client: ElasticClient) extends ElasticClientTrait{
  override def execute[T, R, Q](t: T)(implicit executable: Executable[T, R, Q]): Future[Q] = client.execute(t)(executable)
  override def close(): Unit = client.close
  override def java: Client = client.java
  override def admin: AdminClient = client.admin
  override def iterateSearch(query: SearchDefinition)(implicit timeout: Duration): Iterator[RichSearchResponse] = client.iterateSearch(query)(timeout)
}