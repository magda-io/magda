package au.csiro.data61.magda.api

class LanguageAnalyzerSpec extends LanguageAnalyzerSpecBase {
  override def beforeAll(): Unit = {
    println("Testing LanguageAnalyzerSpec")
    super.beforeAll()
  }


  describe("should return the right dataset when searching for that dataset's") {
    val testWhat = "should return the right dataset when searching for that dataset's"
    describe("title") {
      testDataSetSearch(dataSet => dataSet.title.toSeq, testWhat = s"$testWhat -- title")
    }

    describe("description") {
      testDataSetSearch(dataSet => dataSet.description.toSeq, useLightEnglishStemmer = true, testWhat = s"$testWhat -- description")
    }
  }
}
