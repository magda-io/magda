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
    name <- arbitrary[String]
    interfaceType <- arbitrary[String]
    baseUrl <- urlGen
    pageSize <- arbitrary[Int]
    defaultPublisherName <- Gen.option(arbitrary[String])
  } yield InterfaceConfig(
    name = "Blah",
    interfaceType = "test",
    baseUrl = new URL("http://example.com"),
    pageSize = 50,
    defaultPublisherName = Some("blah")
  )
}