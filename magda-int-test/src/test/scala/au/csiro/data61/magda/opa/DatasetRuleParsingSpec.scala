package au.csiro.data61.magda.opa


import akka.actor.ActorSystem
import akka.event.Logging
import akka.stream.ActorMaterializer
import org.scalatest.{FunSpec, Matchers}
import au.csiro.data61.magda.test.util.TestActorSystem
import org.mockserver.client.MockServerClient
import org.mockserver.model.{HttpRequest => MockRequest, HttpResponse => MockResponse}

import scala.concurrent.Future
import au.csiro.data61.magda.search.elasticsearch.OpaQueryer
import au.csiro.data61.magda.test.MockServer
import au.csiro.data61.magda.test.util.TestActorSystem.config
import com.sksamuel.elastic4s.searches.queries.term.TermQuery
import com.sksamuel.elastic4s.searches.queries.{BoolQuery, Query}
import com.typesafe.config.ConfigValueFactory
import org.scalatest.concurrent.ScalaFutures._

import scala.concurrent.duration._



class DatasetRuleParsingSpec extends FunSpec with Matchers with MockServer {

  implicit val config = TestActorSystem.config
    .withValue("opa.testSessionId", ConfigValueFactory.fromAnyRef("DatasetRuleParsingSpec"))
    .withValue("opa.baseUrl", ConfigValueFactory.fromAnyRef(s"http://localhost:${mockServer.getLocalPort}/v0/opa/"))

  implicit val system = ActorSystem("DatasetRuleParsingSpec", config)
  implicit val logger = Logging(system, getClass)

  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val patienceConfig = PatienceConfig(30.second)

  describe("Sample OPA response") {

    // --- set Opa response
    createExpections()

    it("Should be parsed with no any issues") {
      val opaQueryer = new OpaQueryer()
      whenReady(opaQueryer.publishingStateQuery(Set(), Some(""))){q =>
        opaQueryer.hasErrors shouldBe false
        getShouldFromBoolQuery(q).size shouldBe 8
        getMinMatchFromBoolQuery(q).isEmpty shouldBe false
        getMinMatchFromBoolQuery(q).get shouldBe "1"
      }
    }
  }

  def destructBoolQuery(q:Query): Tuple4[Seq[Query], Seq[Query], Seq[Query], Option[String]] = q match {
    case BoolQuery(
    adjustPureNegative: Option[Boolean],
    boost: Option[Double],
    minimumShouldMatch: Option[String],
    queryName: Option[String],
    filters: Seq[Query],
    must: Seq[Query],
    not: Seq[Query],
    should: Seq[Query]) => (must, should, not, minimumShouldMatch)
    case _ => throw new Error("Failed to match BoolQuery")
  }

  def getShouldFromBoolQuery(q:Query): Seq[Query] = {
    destructBoolQuery(q)._2
  }

  def getMustFromBoolQuery(q:Query): Seq[Query] = {
    destructBoolQuery(q)._1
  }

  def getNotFromBoolQuery(q:Query): Seq[Query] = {
    destructBoolQuery(q)._3
  }

  def getMinMatchFromBoolQuery(q:Query): Option[String] = {
    destructBoolQuery(q)._4
  }

  def createExpections(): Unit ={

    new MockServerClient("localhost", mockServer.getLocalPort)
      .when(
        MockRequest.request()
          .withHeader("content-type", "application/json")
          .withHeader("x-test-session-id", "DatasetRuleParsingSpec")
          .withPath("/v0/opa/compile")
      )
      .respond(
        MockResponse.response()
          .withStatusCode(200)
          //--- always allow response
          .withBody(
          """{
            |  "result": {
            |    "queries": [
            |      [
            |        {
            |          "index": 0,
            |          "terms": {
            |            "type": "ref",
            |            "value": [
            |              {
            |                "type": "var",
            |                "value": "data"
            |              },
            |              {
            |                "type": "string",
            |                "value": "partial"
            |              },
            |              {
            |                "type": "string",
            |                "value": "object"
            |              },
            |              {
            |                "type": "string",
            |                "value": "dataset"
            |              },
            |              {
            |                "type": "string",
            |                "value": "allow"
            |              }
            |            ]
            |          }
            |        }
            |      ]
            |    ],
            |    "support": [
            |      {
            |        "package": {
            |          "path": [
            |            {
            |              "type": "var",
            |              "value": "data"
            |            },
            |            {
            |              "type": "string",
            |              "value": "partial"
            |            },
            |            {
            |              "type": "string",
            |              "value": "object"
            |            },
            |            {
            |              "type": "string",
            |              "value": "dataset"
            |            }
            |          ]
            |        },
            |        "rules": [
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "published"
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "eeb0b93d-580e-4238-8322-8fbff88f9d47"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "ownerId"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "OU01"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "orgUnitOwnerId"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "OU03"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "orgUnitOwnerId"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "OU04"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "orgUnitOwnerId"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "57cbbfad-5755-4b19-989e-7d76ae37ee70"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "preAuthoisedPermissionIds"
            |                      },
            |                      {
            |                        "type": "var",
            |                        "value": "$11"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": true
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "publishingState"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "draft"
            |                  }
            |                ]
            |              },
            |              {
            |                "index": 1,
            |                "terms": [
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "eq"
            |                      }
            |                    ]
            |                  },
            |                  {
            |                    "type": "string",
            |                    "value": "79d71b9e-ea5c-4e07-bb5b-4e86704f9883"
            |                  },
            |                  {
            |                    "type": "ref",
            |                    "value": [
            |                      {
            |                        "type": "var",
            |                        "value": "input"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "object"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "dataset"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "accessControl"
            |                      },
            |                      {
            |                        "type": "string",
            |                        "value": "preAuthoisedPermissionIds"
            |                      },
            |                      {
            |                        "type": "var",
            |                        "value": "$11"
            |                      }
            |                    ]
            |                  }
            |                ]
            |              }
            |            ]
            |          },
            |          {
            |            "default": true,
            |            "head": {
            |              "name": "allow",
            |              "value": {
            |                "type": "boolean",
            |                "value": false
            |              }
            |            },
            |            "body": [
            |              {
            |                "index": 0,
            |                "terms": {
            |                  "type": "boolean",
            |                  "value": true
            |                }
            |              }
            |            ]
            |          }
            |        ]
            |      }
            |    ]
            |  }
            |}""".stripMargin)
      )
  }

}
