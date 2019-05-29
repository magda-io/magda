package au.csiro.data61.magda.api

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes.OK
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.api.model.SearchResult
import au.csiro.data61.magda.model.misc.{DataSet, _}
import au.csiro.data61.magda.search.SearchStrategy.MatchAll
import au.csiro.data61.magda.search.elasticsearch._
import au.csiro.data61.magda.test.util.ApiGenerators.{queryGen, _}
import au.csiro.data61.magda.test.util.Generators
import org.scalacheck._

trait FacetSpecBase extends BaseSearchApiSpec {
  var defaultGen: Gen[((String, List[DataSet], Route), (String, Query), Seq[Nothing])] = _
  override def beforeAll(): Unit = {
    super.beforeAll()
    defaultGen = for {
      tuple <- mediumIndexGen
      query <- textQueryGen(queryGen(tuple._2))
    } yield (tuple, query, Seq())
  }

  def checkFacetsNoQuery(indexGen: Gen[(String, List[DataSet], Route)] = mediumIndexGen, facetSizeGen: Gen[Int] = Gen.posNum[Int])(inner: (List[DataSet], Int) ⇒ Unit): Unit = {
    try {
      forAll(indexGen, facetSizeGen, Gen.posNum[Int], Gen.posNum[Int]) { (tuple, rawFacetSize, start, limit) ⇒
        val (_, dataSets, routes) = tuple
        val facetSize = Math.max(rawFacetSize, 1)

        whenever(start >= 0 && limit >= 0) {
          Get(s"/v0/datasets?query=*&start=$start&limit=$limit&facetSize=$facetSize") ~> addSingleTenantIdHeader ~> routes ~> check {
            status shouldBe OK
            inner(dataSets, facetSize)
          }
        }
      }
    } catch {
      case e: Throwable =>
        e.printStackTrace()
        throw e
    }
  }


  def checkFacetsWithQueryGen(gen: Gen[((String, List[DataSet], Route), (String, Query), Seq[String])] = defaultGen, facetSizeGen: Gen[Int] = Gen.choose(1, 20))(inner: (List[DataSet], Int, Query, List[DataSet], Route) ⇒ Unit): Unit = {
    forAll(gen, facetSizeGen) {
      case ((tuple, query, _), rawFacetSize) ⇒
        val (_, dataSets, routes) = tuple
        val (textQuery, objQuery) = query
        val facetSize = Math.max(rawFacetSize, 1)

        Get(s"/v0/datasets?$textQuery&start=0&limit=${dataSets.size}&facetSize=$facetSize") ~> addSingleTenantIdHeader ~> routes ~> check {
          status shouldBe OK
          inner(responseAs[SearchResult].dataSets, facetSize, objQuery, dataSets, routes)
        }
    }
  }

  def checkFacetsWithQuery(thisTextQueryGen: List[DataSet] => Gen[(String, Query)] = dataSets => textQueryGen(queryGen(dataSets)), thisIndexGen: Gen[(String, List[DataSet], Route)] = indexGen, facetSizeGen: Gen[Int] = Gen.choose(0, 20))(inner: (List[DataSet], Int, Query, List[DataSet], Route) ⇒ Unit): Unit = {
    val gen: Gen[((String, List[DataSet], Route), (String, Query), Seq[String])] = for {
      tuple <- thisIndexGen
      query <- thisTextQueryGen(tuple._2)
    } yield (tuple, query, Seq[String]())
    checkFacetsWithQueryGen(gen, facetSizeGen)(inner)
  }

  def checkFacetsBoth(facetSizeGen: Gen[Int] = Gen.posNum[Int])(inner: (List[DataSet], Int) ⇒ Unit): Unit = {
    it("with no query and various pagination values") {
      checkFacetsNoQuery(facetSizeGen = facetSizeGen)(inner(_, _))
    }
    it("with a query") {
      checkFacetsWithQueryGen(facetSizeGen = facetSizeGen)((dataSets, facetSize, _, _, _) ⇒ inner(dataSets, facetSize))
    }
  }

  def searchWithoutFacetFilter(query: Query, facetType: FacetType, routes: Route, outerResult: SearchResult, allDataSets: List[DataSet])(inner: (SearchResult, List[DataSet]) => Unit): Unit = {
    val queryWithoutFilter = FacetDefinition.facetDefForType(facetType).removeFromQuery(query)
    whenever(!queryWithoutFilter.equals(Query())) {
      val textQueryWithoutFacet = queryToText(queryWithoutFilter)

      Get(s"/v0/datasets?$textQueryWithoutFacet&start=0&limit=${allDataSets.size}&facetSize=1") ~> addSingleTenantIdHeader ~> routes ~> check {
        status shouldBe OK
        val innerResult = responseAs[SearchResult]
        val innerDataSets = innerResult.dataSets
        whenever(innerResult.strategy.get.equals(outerResult.strategy.get) && innerResult.strategy.get.equals(MatchAll)) {
          inner(innerResult, innerDataSets)
        }
      }
    }
  }

  def filter(dataSet: DataSet, facetOption: FacetOption, reducer: DataSet ⇒ Set[String]) = {
    val facetValue = reducer(dataSet)

    facetValue.exists(_.equalsIgnoreCase(facetOption.value))
  }

  def groupResult(dataSets: Seq[DataSet],  reducer: DataSet ⇒ Set[String]): Map[String, Set[DataSet]] = {
    dataSets.foldRight(Map[String, Set[DataSet]]()) { (currentDataSet, aggregator) ⇒
      val reduced = reducer(currentDataSet)

      reduced.foldRight(aggregator) { (string, aggregator) ⇒
        aggregator + (string -> (aggregator.get(string) match {
          case Some(existingDataSets) ⇒ existingDataSets + currentDataSet
          case None                   ⇒ Set(currentDataSet)
        }))
      }
    }
  }

  def getFacet(result: SearchResult, facetType: FacetType) = result.facets.get.find(_.id.equals(facetType.id)).get

  def genericFacetGroupingSpecs(facetType: FacetType, reducer: DataSet ⇒ Set[String], queryCounter: Query ⇒ Int, filterQueryGen: List[DataSet] => Gen[Query], specificGen: List[DataSet] => Gen[Query]): Unit = {
    describe("all facet options should correspond with grouping the datasets for that query") {
      it("without query") {
        checkFacetsNoQuery() { (dataSets: List[DataSet], _: Int) ⇒
          val result = responseAs[SearchResult]

          val groupedResult = groupResult(dataSets, reducer)
          val facet = getFacet(result, facetType)

          whenever(facet.options.nonEmpty) {
            facet.options.foreach { facetOption ⇒
              withClue(s"With reduced values (${groupedResult.mapValues(_.size)}) and facetOption $facetOption: ") {
                if (facetOption.hitCount != 0) {
                  groupedResult.contains(facetOption.value) should be(true)
                  facetOption.hitCount should be(groupedResult(facetOption.value).size)
                } else {
                  groupedResult.contains(facetOption.value) should be(false)
                }
              }
            }
          }
        }
      }

      describe("with query") {
        it("with matched facet options") {
          checkFacetsWithQuery(dataSets => textQueryGen(filterQueryGen(dataSets)), mediumIndexGen) { (dataSets, _, _, _, _) ⇒
            val outerResult = responseAs[SearchResult]
            val facet = getFacet(outerResult, facetType)

            val matched = facet.options.filter(_.matched)
            whenever(matched.nonEmpty && outerResult.strategy.get == MatchAll) {
              val groupedResults = groupResult(dataSets, reducer).mapValues(_.size)
              matched.foreach { option ⇒

                withClue(s"For option $option and grouped datasets $groupedResults and all options ${facet.options}") {
                  groupedResults.get(option.value).foreach { x =>
                    x.toLong should equal(option.hitCount)
                  }
                }
              }
            }
          }
        }

        it("matched facets should come above unmatched") {
          checkFacetsWithQuery(dataSets => textQueryGen(filterQueryGen(dataSets)), mediumIndexGen) { (_, _, _, _, _) ⇒
            val outerResult = responseAs[SearchResult]
            val facet = getFacet(outerResult, facetType)

            val (matched, unmatched) = facet.options.partition(_.matched)
            whenever(matched.nonEmpty && unmatched.nonEmpty) {
              facet.options should equal(matched ++ unmatched)
            }
          }
        }

        it("with unmatched facet options") {
          checkFacetsWithQuery(dataSets => textQueryGen(queryGen(dataSets)), mediumIndexGen) { (_, _, query, allDataSets, routes) ⇒
            val outerResult = responseAs[SearchResult]
            val facet = getFacet(outerResult, facetType)

            searchWithoutFacetFilter(query, facetType, routes, outerResult, allDataSets) { (_, innerDataSets) =>
              val unmatched = facet.options.filter(!_.matched)

              whenever(unmatched.nonEmpty) {
                unmatched.foreach { option ⇒
                  val grouped = groupResult(innerDataSets, reducer)

                  withClue(s"For option $option and grouped datasets ${grouped.mapValues(_.size)}") {
                    grouped(option.value).size shouldEqual option.hitCount
                  }
                }
              }
            }
          }
        }
      }

      describe("exact match facets") {
        it("should not show filters that do not have records") {
          def exactGen(dataSets: List[DataSet]) = for {
            baseQuery <- specificGen(dataSets)
            uuid <- Gen.uuid
            query = baseQuery.copy(freeText = Some(baseQuery.freeText + s""""${uuid.toString}""""))
          } yield query

          checkFacetsWithQuery(dataSets => textQueryGen(exactGen(dataSets)), mediumIndexGen) { (_, _, _, allDataSets, _) ⇒
            val outerResult = responseAs[SearchResult]
            val facet = getFacet(outerResult, facetType)

            val exactMatchFacets = facet.options.filter(option => option.matched && option.hitCount == 0)

            whenever(exactMatchFacets.nonEmpty) {
              val grouped = groupResult(allDataSets, reducer)

              exactMatchFacets.foreach { option =>
                val globalDataSets = allDataSets.filter(filter(_, option, reducer))

                withClue(s"with option $option and $grouped") {
                  globalDataSets.size should be > 0
                }
              }
            }
          }
        }
      }
    }
    }

  def genericDatasetAggregatedIntoFacetSpecs(facetType: FacetType, reducer: DataSet ⇒ Set[String], queryCounter: Query ⇒ Int, filterQueryGen: List[DataSet] => Gen[Query], specificGen: List[DataSet] => Gen[Query]): Unit = {
    describe("each dataset should be aggregated into a facet unless facet size was too small to accommodate it") {
      it("without query") {
        checkFacetsNoQuery(indexGen = smallIndexGen, facetSizeGen = Gen.choose(10, 100)) { (dataSets: List[DataSet], facetSize: Int) ⇒
          val result = responseAs[SearchResult]
          val groupedResult = groupResult(dataSets, reducer)

          whenever(facetSize >= groupedResult.size + queryCounter(result.query)) {
            val facet = getFacet(result, facetType)

            withClue(s"With grouped result $groupedResult") {
              groupedResult.mapValues(_.size).foreach {
                case (facetValue, hitCount) ⇒
                  val option = facet.options.find(_.value.equals(facetValue))
                  withClue(s" and facetValue $facetValue and option $option: ") {
                    option.isDefined should be(true)
                    hitCount should equal(option.get.hitCount)
                  }
              }
            }
          }
        }
      }

      describe("with query") {
        it("for matched facet options") {
          def queryGen(dataSets: List[DataSet]) = Generators.nonEmptyListOf(specifiedPublisherQueryGen(dataSets)).flatMap(publishers => Query(publishers = publishers.map(Specified.apply).toSet))

          checkFacetsWithQuery(dataSets => textQueryGen(queryGen(dataSets)), facetSizeGen = Gen.const(Int.MaxValue)) { (_, facetSize, _, _, _) ⇒
            val outerResult = responseAs[SearchResult]
            val outerDataSets = outerResult.dataSets
            val facet = getFacet(outerResult, facetType)

            val outerGroupedResults = groupResult(outerDataSets, reducer)
            whenever(facetSize == Int.MaxValue && outerResult.strategy.get == MatchAll) {
              withClue(s"With grouped results ${outerGroupedResults.mapValues(_.size)} and options ${facet.options}") {
                outerGroupedResults.mapValues(_.size).foreach {
                  case (facetValue, hitCount) ⇒
                    val option = facet.options.find(_.value.equals(facetValue))
                    withClue(s" and option $facetValue: ") {
                      option.isDefined should be(true)
                      if (option.get.matched) {
                        hitCount should equal(option.get.hitCount)
                      }
                    }
                }
              }
            }
          }
        }

        it("for unmatched facet options") {
          checkFacetsWithQuery(dataSets => textQueryGen(unspecificQueryGen(dataSets)), mediumIndexGen, facetSizeGen = Gen.const(Int.MaxValue)) { (_, facetSize, query, allDataSets, routes) ⇒
            val outerResult = responseAs[SearchResult]
            val facet = getFacet(outerResult, facetType)

            searchWithoutFacetFilter(query, facetType, routes, outerResult, allDataSets) { (_, innerDataSets) =>
              val innerGroupedResult = groupResult(innerDataSets, reducer)

              whenever(facetSize == Int.MaxValue) {
                withClue(s"With grouped results ${innerGroupedResult.mapValues(_.size)} ") {
                  innerGroupedResult.mapValues(_.size).foreach {
                    case (facetValue, hitCount) ⇒
                      val option = facet.options.find(_.value.equals(facetValue))
                      withClue(s" and option $option: ") {
                        option.isDefined should be(true)
                        if (!option.get.matched) {
                          hitCount should equal(option.get.hitCount)
                        }
                      }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

