package au.csiro.data61.magda.test.util

import au.csiro.data61.magda.model.misc.DataSet

object MagdaMatchers extends org.scalatest.Matchers {
  def dataSetEqual(ds1: DataSet, ds2: DataSet) = ds1.copy(indexed = None) should equal(ds2.copy(indexed = None))
  def dataSetsEqual(dsSeq1: Seq[DataSet], dsSeq2: Seq[DataSet]) = dsSeq1.zip(dsSeq2).foreach { case (ds1, ds2) => dataSetEqual(ds1, ds2) }
}