package au.csiro.data61.magda.test.util

import au.csiro.data61.magda.test.util.Generators
import org.scalacheck.Gen
import au.csiro.data61.magda.external.InterfaceConfig
import java.net.URL
import org.scalacheck.Arbitrary._

object IndexerGenerators {
  val urlGen = for {
    scheme <- Gen.oneOf("http", "https")
    host <- Gen.alphaNumStr
    tld <- Gen.oneOf("com", "net", "com.au", "org", "de")
    path <- Gen.listOf(Gen.alphaNumStr).map(_.mkString("/"))
  } yield new URL(s"$scheme://$host.$tld/$path")

  val interfaceConfGen = for {
    name <- arbitrary[String].suchThat(!_.isEmpty)
    interfaceType <- arbitrary[String]
    baseUrl <- urlGen
    pageSize <- Gen.choose(1, 30)
    defaultPublisherName <- Gen.option(arbitrary[String])
  } yield InterfaceConfig(
    name = name,
    interfaceType = interfaceType,
    baseUrl = baseUrl,
    pageSize = pageSize,
    defaultPublisherName = defaultPublisherName
  )
}