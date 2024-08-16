package au.csiro.data61.magda.search.elasticsearch

import akka.actor.ActorSystem
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searchPipeline.{
  CombinationTechnique,
  CombinationTechniqueType,
  GetSearchPipelineRequest,
  NormalizationProcessor,
  NormalizationTechniqueType,
  PutSearchPipelineRequest,
  SearchPipeline
}
import au.csiro.data61.magda.util.RichConfig._

import scala.concurrent.Future

object IndexUtils {

  private def createSearchPipeline(
      actorSystem: ActorSystem,
      client: ElasticClient
  ) = {
    implicit val ec = actorSystem.dispatcher
    val logger = actorSystem.log

    val searchPipelineConfig = HybridSearchConfig.searchPipeline
    val searchPipelineId = HybridSearchConfig.searchPipelineId

    client
      .execute(
        PutSearchPipelineRequest(
          SearchPipeline(
            id = searchPipelineId,
            processors = Seq(
              NormalizationProcessor(
                normalizationTechnique = NormalizationTechniqueType
                  .withName(
                    searchPipelineConfig
                      .getString("normalization.technique")
                  ),
                combinationTechnique = Some(
                  CombinationTechnique(
                    techniqueType = CombinationTechniqueType.withName(
                      searchPipelineConfig
                        .getString("combination.technique")
                    ),
                    weights = searchPipelineConfig.getOptionalDoubleList(
                      "combination.weights"
                    )
                  )
                )
              )
            )
          )
        )
      )
      .map { _ =>
        logger.info(
          s"""Search pipeline ${searchPipelineId} has been created."""
        )
      }
  }

  def ensureDatasetHybridSearchPipeline(recreateWhenExist: Boolean = false)(
      implicit actorSystem: ActorSystem,
      client: ElasticClient
  ): Future[Unit] = {
    implicit val ec = actorSystem.dispatcher
    val logger = actorSystem.log

    if (!HybridSearchConfig.enabled || !HybridSearchConfig.searchPipelineAutoCreate) {
      logger.info(
        "Hybrid search is off or search pipeline auto-create is off. Skip creating datasets hybrid search search pipeline..."
      )
      Future(Unit)
    } else {
      if (recreateWhenExist) {
        createSearchPipeline(actorSystem, client)
      } else {
        // only attempt to create when the pipeline doesn't exist
        val searchPipelineId = HybridSearchConfig.searchPipelineId
        client
          .execute(
            GetSearchPipelineRequest(searchPipelineId)
          )
          .flatMap { res =>
            if (!res.isError) {
              logger.info(
                s"""Search Pipeline `${searchPipelineId}` exist. Skip creation."""
              )
              Future(Unit)
            } else {
              if (res.status != 404) {
                throw new Exception(
                  s"""Failed to retrieve search pipeline. Status: ${res.status} Error: ${res.body
                    .getOrElse(res.error.reason)}"""
                )
              } else {
                createSearchPipeline(actorSystem, client)
              }
            }
          }
      }
    }
  }
}
