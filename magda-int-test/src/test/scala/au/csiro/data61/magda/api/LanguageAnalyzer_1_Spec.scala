package au.csiro.data61.magda.api

class LanguageAnalyzer_1_Spec extends LanguageAnalyzerSpecBase {
  override def beforeAll(): Unit = {
    println("Testing LanguageAnalyzerSpec")
    super.beforeAll()
  }


  describe("should return the right dataset when searching for that dataset's") {
    val testWhat = "should return the right dataset when searching for that dataset's"

    describe("keywords") {
      testDataSetSearch(dataSet => dataSet.keywords, testWhat = s"$testWhat -- keywords")
    }

    describe("publisher name") {
      testDataSetSearch(dataSet => dataSet.publisher.toSeq.flatMap(_.name.toSeq), testWhat = s"$testWhat -- publisher name")
    }
  }

}
