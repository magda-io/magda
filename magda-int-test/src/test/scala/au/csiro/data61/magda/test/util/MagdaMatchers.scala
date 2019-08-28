package au.csiro.data61.magda.test.util

import au.csiro.data61.magda.model.misc.DataSet
import org.tartarus.snowball.ext.PorterStemmer
import org.apache.lucene.analysis.standard.StandardTokenizer
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute
import org.apache.lucene.analysis.en._

object MagdaMatchers extends org.scalatest.Matchers {

  def dataSetEqual(ds1: DataSet, ds2: DataSet) =
    ds1.copy(
      indexed = None,
      score = None,
      publisher = ds1.publisher.map(_.copy(acronym = None))
    ) should equal(
      ds2.copy(
        indexed = None,
        score = None,
        publisher = ds2.publisher.map(_.copy(acronym = None))
      )
    )

  def dataSetsEqual(dsSeq1: Seq[DataSet], dsSeq2: Seq[DataSet]) =
    dsSeq1.zip(dsSeq2).foreach {
      case (ds1, ds2) =>
        dataSetEqual(ds1, ds2)
    }

  def dataSetsEqualIgnoreOrder(dsSeq1: Seq[DataSet], dsSeq2: Seq[DataSet]) =
    for {
      dataSet <- dsSeq1
      isIn2 = dsSeq2
        .find(_.identifier == dataSet)
        .map(dataSetFrom2 => dataSetEqual(dataSet, dataSetFrom2))
        .getOrElse(false)
    } yield isIn2

  def porterStem(string: String) = {
    val stemmer = new PorterStemmer()
    stemmer.setCurrent(string)

    if (stemmer.stem) stemmer.getCurrent else string
  }

  def lightEnglishStem(string: String): String = {
    val stemmer = new LightEnglishStemmer
    return stemmer.stem(string)
  }

  def stemString(term: String, useLightEnglishStemmer: Boolean = false) = {
    if (useLightEnglishStemmer) {
      MagdaMatchers.lightEnglishStem(term)
    } else {
      MagdaMatchers.porterStem(term)
    }
  }

  def toEnglishToken(string: String) = porterStem(string.toLowerCase)

  def extractAlphaNum(string: String) =
    string.filter(_.isLetterOrDigit).toLowerCase

  def matchPhrases(phrase1: String, phrase2: String) = {
    extractAlphaNum(phrase1) == extractAlphaNum(phrase2)
  }

  def tokenize(input: String) = {
    val st = new StandardTokenizer()
    val reader = new java.io.StringReader(input)
    st.setReader(reader)
    st.reset
    val attr = st.addAttribute(classOf[CharTermAttribute])
    var list = Seq[String]()

    while (st.incrementToken) {
      list = list :+ attr.toString()
    }

    list
  }
}
