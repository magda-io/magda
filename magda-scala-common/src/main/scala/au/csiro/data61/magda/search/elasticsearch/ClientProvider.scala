package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import akka.event.LoggingAdapter
import au.csiro.data61.magda.AppConfig
import au.csiro.data61.magda.util.ErrorHandling.retry
import com.sksamuel.elastic4s.{ElasticClient, ElasticProperties}

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._
import com.sksamuel.elastic4s.http.{JavaClient, NoOpHttpClientConfigCallback}
import com.typesafe.config.Config
import org.apache.http.auth.{AuthScope, UsernamePasswordCredentials}
import org.apache.http.client.config.RequestConfig
import org.apache.http.impl.client.BasicCredentialsProvider
import org.apache.http.impl.nio.client.HttpAsyncClientBuilder
import org.elasticsearch.client.RestClientBuilder.{
  HttpClientConfigCallback,
  RequestConfigCallback
}
import java.nio.file.{Paths}
import nl.altindag.ssl.SSLFactory
import nl.altindag.ssl.pem.util.PemUtils

trait ClientProvider {
  def getClient(): Future[ElasticClient]
}

class DefaultClientProvider(
    implicit val system: ActorSystem,
    implicit val ec: ExecutionContext,
    implicit val config: Config
) extends ClientProvider {
  private var clientFuture: Option[Future[ElasticClient]] = None
  private implicit val scheduler = system.scheduler
  private val logger = system.log

  val serverUrl = AppConfig
    .conf()
    .getString("elasticSearch.serverUrl")

  logger.info("Elastic Client server Url: {}", serverUrl)

  val serverUrlProperties = ElasticProperties(serverUrl)
  val serverProtocol = serverUrlProperties.endpoints.head.protocol
  val isHttps = serverProtocol.toLowerCase == "https"

  var basicAuth: Boolean = false

  try {
    basicAuth = config.getConfig("elasticSearch").getBoolean("basicAuth")
  } catch {
    //--- mute the error, default value will be used
    case _: Throwable =>
  }

  logger.info("Elastic Client basicAuth: {}", basicAuth)

  val httpClientConfigCallback =
    if (basicAuth || isHttps)
      new HttpClientConfigCallback {
        override def customizeHttpClient(
            httpClientBuilder: HttpAsyncClientBuilder
        ): HttpAsyncClientBuilder = {
          var builder = httpClientBuilder
          if (basicAuth) {
            val username = sys.env.get("ES_USERNAME").getOrElse("admin")
            val password = sys.env.get("ES_PASSWORD").getOrElse("")
            if (username.isEmpty) {
              logger.warning("supplied authenticated username is empty.")
            }
            if (password.isEmpty) {
              logger.warning("supplied authenticated password is empty.")
            }
            val credentials = new BasicCredentialsProvider()
            credentials.setCredentials(
              AuthScope.ANY,
              new UsernamePasswordCredentials(username, password)
            )
            builder =
              httpClientBuilder.setDefaultCredentialsProvider(credentials)
          }
          if (isHttps) {
            val sslFactory = getSslFactory()
            builder = httpClientBuilder
              .setSSLContext(sslFactory.getSslContext())
              .setSSLHostnameVerifier(sslFactory.getHostnameVerifier())
          }
          builder
        }
      } else NoOpHttpClientConfigCallback

  var connectTimeout = 50000
  var socketTimeout = 10000

  try {
    connectTimeout = config.getConfig("elasticSearch").getInt("connectTimeout")
  } catch {
    //--- mute the error, default value will be used
    case _: Throwable =>
  }

  try {
    socketTimeout = config.getConfig("elasticSearch").getInt("socketTimeout")
  } catch {
    //--- mute the error, default value will be used
    case _: Throwable =>
  }

  logger.info("Elastic Client connectTimeout: {}", connectTimeout)
  logger.info("Elastic Client socketTimeout: {}", socketTimeout)

  val requestConfigCallback = new RequestConfigCallback {
    override def customizeRequestConfig(
        requestConfigBuilder: RequestConfig.Builder
    ): RequestConfig.Builder = {

      requestConfigBuilder
      /* It's a long lasting bug in upstream Elasticsearch project Rest Client Code
         * See https://github.com/elastic/elasticsearch/issues/24069
         * It's fixed in master now but still yet to release to 6.3.1 (Current, most recent version is 6.3.0)
         * We will override this setting to fix it here.
         */
        .setConnectionRequestTimeout(0)
        /*
         * The default setting (1s) was too low. A JVM GC delay will break the connection.
         * Set to 30s by default. Also, can be changed by config file.
         */
        .setConnectTimeout(connectTimeout)
        .setSocketTimeout(socketTimeout)
    }
  }

  val disableSslVerification =
    config.getConfig("elasticSearch").getBoolean("disableSslVerification")

  logger.info(
    "Elastic Client disableSslVerification: {}",
    disableSslVerification
  )

  val clientTlsAuthentication =
    config.getConfig("elasticSearch").getBoolean("clientTlsAuthentication")

  logger.info(
    "Elastic Client clientTlsAuthentication: {}",
    clientTlsAuthentication
  )

  val trustedCertPath =
    if (config.hasPath("elasticSearch.trustedCertPath"))
      config.getConfig("elasticSearch").getString("trustedCertPath")
    else ""

  val clientCertKeyPath =
    if (config.hasPath("elasticSearch.clientCertKeyPath"))
      config.getConfig("elasticSearch").getString("clientCertKeyPath")
    else ""

  val clientCertPath =
    if (config.hasPath("elasticSearch.clientCertPath"))
      config.getConfig("elasticSearch").getString("clientCertPath")
    else ""

  def getSslFactory() = {
    if (disableSslVerification) {
      SSLFactory
        .builder()
        .withUnsafeTrustMaterial()
        .withUnsafeHostnameVerifier()
        .build()
    } else {
      if (clientTlsAuthentication) {
        if (trustedCertPath.isEmpty) {
          throw new Exception(
            "Elasticsearch client: elasticSearch.trustedCertPath cannot be empty"
          )
        }
        if (clientCertPath.isEmpty) {
          throw new Exception(
            "Elasticsearch client: elasticSearch.clientCertPath cannot be empty"
          )
        }
        if (clientCertKeyPath.isEmpty) {
          throw new Exception(
            "Elasticsearch client: elasticSearch.clientCertKeyPath cannot be empty"
          )
        }
        SSLFactory
          .builder()
          .withIdentityMaterial(
            PemUtils.loadIdentityMaterial(
              Paths.get(clientCertPath),
              Paths.get(clientCertKeyPath)
            )
          )
          .withTrustMaterial(
            PemUtils.loadTrustMaterial(
              Paths.get(trustedCertPath)
            )
          )
          .build()
      } else {
        if (trustedCertPath.isEmpty) {
          SSLFactory
            .builder()
            .withDefaultTrustMaterial()
            .build()
        } else {
          SSLFactory
            .builder()
            .withTrustMaterial(
              PemUtils.loadTrustMaterial(
                Paths.get(trustedCertPath)
              )
            )
            .build()
        }

      }
    }
  }

  override def getClient(): Future[ElasticClient] = {

    val outerFuture = clientFuture match {
      case Some(future) => future
      case None =>
        val future = retry(
          () =>
            Future {
              ElasticClient(
                JavaClient(
                  serverUrlProperties,
                  requestConfigCallback = requestConfigCallback,
                  httpClientConfigCallback = httpClientConfigCallback
                )
              )
            },
          10 seconds,
          10,
          onRetry(logger)
        ).map { client =>
          logger.info(
            "Successfully made initial contact with the ES client (this doesn't mean we're fully connected yet!)"
          )
          client
        }

        clientFuture = Some(future)

        future
    }

    outerFuture
  }

  private def onRetry(
      logger: LoggingAdapter
  )(retriesLeft: Int, error: Throwable) =
    logger.error(
      "Failed to make initial contact with ES server, {} retries left \n {}",
      retriesLeft,
      error
    )
}
