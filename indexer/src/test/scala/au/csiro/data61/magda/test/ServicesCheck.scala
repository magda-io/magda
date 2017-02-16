package au.csiro.data61.magda.test

import org.scalatest.FlatSpec
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import au.csiro.data61.magda.AppConfig
import org.scalatest.BeforeAndAfterAll
import com.typesafe.config.Config
import akka.testkit.TestKit
import org.scalatest.FlatSpecLike
import au.csiro.data61.magda.external.InterfaceConfig
import au.csiro.data61.magda.external.ExternalInterface
import au.csiro.data61.magda.test.util.ConcurrentUtil.RichFuture
import org.scalatest.Matchers
import org.scalatest.DoNotDiscover

@DoNotDiscover
class ServicesCheck extends TestKit(ActorSystem("MySpec")) with FlatSpecLike with BeforeAndAfterAll with Matchers {

  //  implicit val system = ActorSystem()
  implicit val executor = system.dispatcher
  implicit val materializer = ActorMaterializer()
  implicit val config: Config = AppConfig.conf(Some("dev"))

  val configs = InterfaceConfig.all
  val interfaces = configs.map(thisConfig => (thisConfig, ExternalInterface(thisConfig)))

  interfaces.foreach {
    case (thisConfig, interface) =>
      thisConfig.name should "return their count and their first item" in {
        val totalDataSetCount = interface.getTotalDataSetCount().await
        totalDataSetCount should be > 0l
        val firstDataSet = interface.getDataSets(0, 1).await
        val lastDataSet = interface.getDataSets(totalDataSetCount - 1, 1).await

        firstDataSet.head.title.isEmpty should not be true

        println(firstDataSet.head.landingPage)
      }
  }

  override def afterAll {
    TestKit.shutdownActorSystem(system)
  }
}