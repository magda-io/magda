package au.csiro.data61.magda.test.util

import org.scalatest.prop.Configuration.PropertyCheckConfiguration
import org.scalactic.anyvals.PosInt
import org.scalatest.prop.GeneratorDrivenPropertyChecks

trait MagdaGeneratorTest extends GeneratorDrivenPropertyChecks {
  val processors = Math.max(2, if (ContinuousIntegration.isCi) 4 else Runtime.getRuntime.availableProcessors - 1)
  val minSuccessful = if (ContinuousIntegration.isCi) 100 else 20
  implicit override val generatorDrivenConfig: PropertyCheckConfiguration =
    PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = PosInt(50), minSuccessful = PosInt.from(minSuccessful).get)
    
    
//  implicit def indexShrinker(implicit s: Shrink[String]): Shrink[String] = Shrink[String] {
//    case (indexName, dataSets, route) ⇒
//      Shrink.shrink(dataSets).map(shrunkDataSets ⇒ {
//        logger.info("Shrunk datasets to size {} from {}", shrunkDataSets.size, dataSets.size)
//
//        val result = putDataSetsInIndex(shrunkDataSets)
//        cleanUpQueue.add(result._1)
//        result
//      })
//  }
}