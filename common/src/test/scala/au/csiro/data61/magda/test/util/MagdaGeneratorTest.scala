package au.csiro.data61.magda.test.util

import org.scalatest.prop.Configuration.PropertyCheckConfiguration
import org.scalactic.anyvals.PosInt
import org.scalatest.prop.GeneratorDrivenPropertyChecks

trait MagdaGeneratorTest extends GeneratorDrivenPropertyChecks {
  val processors = Math.max(Math.min(Runtime.getRuntime().availableProcessors(), 4), 2)
  val minSuccessful = if (ContinuousIntegration.isCi) 100 else 20
  implicit override val generatorDrivenConfig: PropertyCheckConfiguration =
    PropertyCheckConfiguration(workers = PosInt.from(processors).get, sizeRange = PosInt(50), minSuccessful = PosInt.from(minSuccessful).get)
}