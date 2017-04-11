package au.csiro.data61.magda.registry

import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.model.StatusCodes
import akka.http.scaladsl.testkit.ScalatestRouteTest
import akka.testkit.TestProbe
import org.scalatest.Matchers
import org.scalatest.fixture.FunSpec
import scalikejdbc._

class AspectsServiceSpec extends ApiSpec {
  it("starts with none defined") { api =>
    Get("/api/0.1/aspects") ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[List[AspectDefinition]].length shouldEqual 0
    }
  }

  it("can be added with POST") { api =>
    val aspectDefinition = AspectDefinition("testId", "testName", None)
    Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)

      Get("/api/0.1/aspects") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val aspectDefinitions = responseAs[List[AspectDefinition]]
        aspectDefinitions.length shouldEqual 1
        aspectDefinitions(0) shouldEqual AspectDefinition("testId", "testName", None)
      }
    }
  }

  it("can be added with PUT") { api =>
    val aspectDefinition = AspectDefinition("testId", "testName", None)
    Put("/api/0.1/aspects/testId", aspectDefinition) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)

      Get("/api/0.1/aspects") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK

        val aspectDefinitions = responseAs[List[AspectDefinition]]
        aspectDefinitions.length shouldEqual 1
        aspectDefinitions(0) shouldEqual AspectDefinition("testId", "testName", None)
      }
    }
  }

  it("can be updated with PUT") { api =>
    val aspectDefinition = AspectDefinition("testId", "testName", None)
    Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
      val newDefinition = aspectDefinition.copy(name = "newName")
      Put("/api/0.1/aspects/testId", newDefinition) ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "newName", None)
      }
    }
  }

  it("can be retrieved by ID") { api =>
    val aspectDefinition = AspectDefinition("testId", "testName", None)
    Put("/api/0.1/aspects/testId", aspectDefinition) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)

      Get("/api/0.1/aspects/testId") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("testId", "testName", None)
      }
    }
  }

  it("POST supports invalid URL characters in ID") { api =>
    val aspectDefinition = AspectDefinition("in valid", "testName", None)
    Post("/api/0.1/aspects", aspectDefinition) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual AspectDefinition("in valid", "testName", None)

      Get("/api/0.1/aspects/in%20valid") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("in valid", "testName", None)
      }
    }
  }

  it("PUT supports invalid URL characters in ID") { api =>
    val aspectDefinition = AspectDefinition("in valid", "testName", None)
    Put("/api/0.1/aspects/in%20valid", aspectDefinition) ~> api.routes ~> check {
      status shouldEqual StatusCodes.OK
      responseAs[AspectDefinition] shouldEqual AspectDefinition("in valid", "testName", None)

      Get("/api/0.1/aspects/in%20valid") ~> api.routes ~> check {
        status shouldEqual StatusCodes.OK
        responseAs[AspectDefinition] shouldEqual AspectDefinition("in valid", "testName", None)
      }
    }
  }
}
