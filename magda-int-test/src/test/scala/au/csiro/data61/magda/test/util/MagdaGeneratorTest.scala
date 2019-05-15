package au.csiro.data61.magda.test.util

import org.scalatest.prop.Configuration.PropertyCheckConfiguration
import org.scalactic.anyvals.PosInt
import org.scalatest.prop.GeneratorDrivenPropertyChecks

trait MagdaGeneratorTest extends GeneratorDrivenPropertyChecks {
  val processors = Math.max(1, if (ContinuousIntegration.isCi) Runtime.getRuntime.availableProcessors - 2 else Runtime.getRuntime.availableProcessors - 1)
  val minSuccessful = if (ContinuousIntegration.isCi) 2 else 2
  implicit override val generatorDrivenConfig: PropertyCheckConfiguration =
    PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = 2, minSuccessful = PosInt.from(minSuccessful).get)
}
