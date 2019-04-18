package au.csiro.data61.magda.opa


import java.util.concurrent.ConcurrentHashMap

import akka.event.Logging
import akka.http.scaladsl.server.Route
import au.csiro.data61.magda.model.misc.DataSet
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach, FunSpec, Matchers}
import au.csiro.data61.magda.test.util.TestActorSystem
import org.mockserver.client.MockServerClient
import org.mockserver.model.{HttpRequest => MockRequest, HttpResponse => MockResponse}
import org.mockserver.integration.ClientAndServer

import scala.concurrent.Future



class DatasetRuleParsingSpec extends FunSpec with Matchers with BeforeAndAfterEach with BeforeAndAfterAll {

  val system = TestActorSystem.actorSystem
  val logger = Logging(system, getClass)

  java.lang.System.setProperty("mockserver.logLevel", "WARN")

  var mockServerOption:Option[ClientAndServer] = None

  override def beforeAll= {
    logger.info("beforeAll...")
    mockServerOption = Some(ClientAndServer.startClientAndServer(6104))
  }

  override def afterAll= {
    logger.info("beforeAll...")
    mockServerOption.get.stop()
  }

  override def afterEach(): Unit = {
    mockServerOption.get.reset()
  }

  describe("Should parse sample OPA response with no any issues") {
    
  }

  def createExpections(): Unit ={

    new MockServerClient("localhost", 6104)
      .when(
        MockRequest.request()
          .withHeader("content-type", "application/json")
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
