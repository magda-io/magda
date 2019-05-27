package au.csiro.data61.magda.api

import scala.util.Random

class LanguageAnalyzer_2_Spec extends LanguageAnalyzerSpecBase {
  override def beforeAll(): Unit = {
    super.beforeAll()
  }

  describe("should return the right dataset when searching for that dataset's") {
    val testWhat = "should return the right dataset when searching for that dataset's"

    describe("distribution title") {
      testDataSetSearch(dataSet => {
        // --- only randomly pick one distribution to test as now it's AND operator in simple_string_query
        Random.shuffle(dataSet.distributions).take(1).map(_.title)
      }, testWhat = s"$testWhat -- distribution title")
    }

    describe("distribution description") {
      testDataSetSearch(dataSet => {
        Random.shuffle(dataSet.distributions).take(1).flatMap(_.description.toSeq)
      }, useLightEnglishStemmer = true, s"$testWhat -- distribution description")
    }

    describe("theme") {
      testDataSetSearch(dataSet => dataSet.themes, useLightEnglishStemmer = true, s"$testWhat -- theme")
    }
  }

}
