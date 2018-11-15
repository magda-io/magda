package au.csiro.data61.magda.indexer

import akka.actor.{ActorSystem, Status}
import akka.pattern
import akka.stream.{ActorMaterializer, OverflowStrategy, QueueOfferResult}
import akka.stream.scaladsl.{Flow, Keep, Sink, Source}
import akka.testkit.{ImplicitSender, TestActors, TestKit, TestProbe}
import akka.pattern.pipe
import akka.stream.testkit.scaladsl.{TestSink, TestSource}
import org.scalatest.{BeforeAndAfterAll, Matchers, WordSpecLike}

import scala.concurrent.{Await, ExecutionContextExecutor, Future}
import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}
import java.util.concurrent.atomic.{AtomicBoolean, AtomicInteger}

import akka.stream.scaladsl.Source
import akka.stream.testkit.scaladsl.TestSink
import akka.{Done, NotUsed}
import org.slf4j.LoggerFactory

import scala.language.postfixOps
//import akka.testkit.TimingTest
import scala.concurrent._
import scala.concurrent.duration._

class Playground() extends TestKit(ActorSystem("Playground")) with ImplicitSender
  with WordSpecLike with Matchers with BeforeAndAfterAll {

  implicit val ec: ExecutionContextExecutor = system.dispatcher
  implicit val materializer: ActorMaterializer = ActorMaterializer()
  val logger = LoggerFactory.getLogger(getClass)

  " source queue " must {
    "illustrate use of source queue" in {
      /**
        * The source can produce elements very fast.
        * bufferSize == 0, parallelism == 1
        * Because the buffer is always full, after an element is produced, its enqueue task,
        * queue.offer(x), can not be completed soon. The next produced element will not be
        * enqueued, back pressuring the source, signalling it not to produce more elements.
        *
        * It is an error if parallelism > 1.
        *
        * bufferSize == 0, parallelism == 1
        * Because the buffer is empty initially, the 1st element is enqueued immediately after it
        * is produced. Because the buffer has become full, the 2nd element can not be enqueued right
        * after it is produced. Its enqueue is pending.
        *
        * It is an error if parallelism > 1.
        */
      val bufferSize = 20
      val elementsToProcess = 3

      // The queue will not complete automatically.
      val queue = Source
        .queue[Int](bufferSize, OverflowStrategy.backpressure)
        .batch(2, Seq(_))(_ :+ _)
        .initialDelay(delay = 500 milliseconds)
//        .throttle(elementsToProcess, 3.second)
        .toMat(Sink.foreach(x ⇒ {
          logger.debug(s"      start processing $x")
          Thread.sleep(3000)
          logger.debug(s"      end processing $x")
        }))(Keep.left)
        .run()

      val source = Source(1 to 10)

      val offerToStreamF = source.mapAsync(1)(x ⇒ {
        logger.debug("produced " + x)
        val enqueueF = queue.offer(x).map {
          case QueueOfferResult.Enqueued    ⇒ s"Enqueue $x done."
          case QueueOfferResult.Dropped     ⇒ s"Drop $x done."
          case QueueOfferResult.Failure(ex) ⇒ s"Offer failed: ${ex.getMessage}"
          case QueueOfferResult.QueueClosed ⇒ "Source Queue closed"
        }

        enqueueF.onComplete{
          case Success(s) =>
            logger.debug(s"  $s")
          case Failure(e) =>
            logger.debug(s"  Enqueue failed with ${e.getMessage}.")
        }

        enqueueF
      }).runWith(Sink.ignore)

      offerToStreamF.onComplete{
        case Success(x) =>
          logger.debug(s"Offer elements to stream completed with success $x.")
        case Failure(e) =>
          logger.debug(s"Offer elements to stream completed with failure ${e.getMessage}.")
      }

      offerToStreamF.onComplete( _ => queue.complete())

      val queueCompleteF= queue.watchCompletion().map(x => logger.debug(s"Source queue completed with $x."))
      Await.result(queueCompleteF, Duration.Inf)
    }
  }

  def adhocSource[T](source: Source[T, _], timeout: FiniteDuration, maxRetries: Int): Source[T, _] =
    Source.lazily(
      () ⇒ source.backpressureTimeout(timeout).recoverWithRetries(maxRetries, {
        case t: TimeoutException ⇒
          println("******* Timeout! **********" + t.getMessage)
          Source.lazily(() ⇒ source.backpressureTimeout(timeout)).mapMaterializedValue(_ ⇒ NotUsed)
        case _: Any => throw new Exception("**** Unknown **** ")
      })
    )

  "Recipe for adhoc source" must {
    "not start the source if there is no demand" in {
      val isStarted = new AtomicBoolean()
      adhocSource(Source.empty.mapMaterializedValue(_ ⇒ isStarted.set(true)), 200.milliseconds, 3)
        .runWith(TestSink.probe[String])
      Thread.sleep(300)
      isStarted.get() should be(false)
    }

    "start the source when there is a demand" in {
      val sink = adhocSource(Source.repeat("a").take(2), 200.milliseconds, 3)
        .runWith(TestSink.probe[String])
      sink.requestNext("a")
//      sink.cancel()
//      sink.request(3000) // no effect?
      sink.requestNext() should be ("a")
    }

    "start the source when there is a demand 2" in {
      val isStarted = new AtomicBoolean()
      val sink = adhocSource(Source.repeat("a").take(2)
        .map(x ⇒ {
          println("x = " + x)
          if (x === "a")
            isStarted.set(true)
          else
            isStarted.set(false)
        }), 50.milliseconds, 2)
        .runWith(TestSink.probe)


      Thread.sleep(200)
      isStarted.get() should be(false)
      sink.requestNext()
      isStarted.get() should be(true)
      Thread.sleep(200)
      sink.requestNext()
      isStarted.get() should be(false)
    }

    "shut down the source when the next demand times out" in {
      val shutdown = Promise[Done]()
      val sink = adhocSource(
        Source.repeat("a").watchTermination() { (_, term) ⇒
          shutdown.completeWith(term)
        }, 200.milliseconds, 3)
        .runWith(TestSink.probe[String])

      sink.requestNext("a")
      Thread.sleep(200)
      shutdown.future.map(result => {
        println(result)
        result should be(Done)
      })
    }

    "not shut down the source when there are still demands" in {
      val shutdown = Promise[Done]()
      val sink = adhocSource(
        Source.repeat("a").watchTermination() { (_, term) ⇒
          shutdown.completeWith(term)
        }, 200.milliseconds, 3)
        .runWith(TestSink.probe[String])

      sink.requestNext("a")
      Thread.sleep(100)
      sink.requestNext("a")
      Thread.sleep(100)
      sink.requestNext("a")
      Thread.sleep(100)
      sink.requestNext("a")
      Thread.sleep(100)
      sink.requestNext("a")
      Thread.sleep(100)

      shutdown.isCompleted should be(false)
    }

    "restart upon demand again after timeout" in {
      val shutdown = Promise[Done]()
      val startedCount = new AtomicInteger(0)

      val source = Source
        .empty.mapMaterializedValue(_ ⇒ startedCount.incrementAndGet())
        .concat(Source.repeat("a"))

      val sink = adhocSource(source.watchTermination() { (_, term) ⇒
        shutdown.completeWith(term)
      }, 200.milliseconds, 3)
        .runWith(TestSink.probe[String])

      sink.requestNext("a")
      startedCount.get() should be(1)
      Thread.sleep(200)
      shutdown.future.map(result => {
        println(result)
        result should be(Done)
      })
    }

    "restart up to specified maxRetries" in {
      val shutdown = Promise[Done]()
      val startedCount = new AtomicInteger(0)

      val source = Source
        .empty.mapMaterializedValue(_ ⇒ startedCount.incrementAndGet())
        .concat(Source.repeat("a"))

      val sink = adhocSource(source.watchTermination() { (_, term) ⇒
        shutdown.completeWith(term)
      }, 200.milliseconds, 3)
        .runWith(TestSink.probe[String])

      sink.requestNext("a")
      startedCount.get() should be(1)

      Thread.sleep(500)
      shutdown.isCompleted should be(true)

      Thread.sleep(500)
      sink.requestNext("a")
      startedCount.get() should be(2)

      Thread.sleep(500)
      sink.requestNext("a")
      startedCount.get() should be(3)

      Thread.sleep(500)
      sink.requestNext("a")
      startedCount.get() should be(4) //startCount == 4, which means "re"-tried 3 times

      Thread.sleep(500)
      sink.expectError().getClass should be(classOf[TimeoutException])
      sink.request(1) //send demand
      sink.expectNoMessage(200.milliseconds) //but no more restart
    }
  }

  override def afterAll: Unit = {
    TestKit.shutdownActorSystem(system)
  }

  "An Echo actor" must {

    "send back messages unchanged" in {
      val echo = system.actorOf(TestActors.echoActorProps)
      echo ! "hello world"
      expectMsg("hello world")
    }

  }

  "This stream" must {
    "sink" in {
      val sinkUnderTest = Flow[Int].map(_ * 2).toMat(Sink.fold(0)(_ + _))(Keep.right)

      val future = Source(1 to 4).runWith(sinkUnderTest)
      val result = Await.result(future, 3.seconds)
      assert(result == 20)
    }

    "source" in {
      val sourceUnderTest = Source.repeat(1).map(_ * 2)

      val future = sourceUnderTest.take(10).runWith(Sink.seq)
      val result = Await.result(future, 3.seconds)
      assert(result == Seq.fill(10)(2))
    }

    "flow" in {
      val flowUnderTest = Flow[Int].takeWhile(_ < 5)

      val future = Source(1 to 10).via(flowUnderTest).runWith(Sink.fold(Seq.empty[Int])(_ :+ _))
      val result = Await.result(future, 3.seconds)
      assert(result == (1 to 4))
    }

    "probe source" in {
      val sourceUnderTest = Source(1 to 4).grouped(2)

      val probe = TestProbe()
      sourceUnderTest.runWith(Sink.seq).pipeTo(probe.ref)
      probe.expectMsg(3.seconds, Seq(Seq(1, 2), Seq(3, 4)))
    }

    "test probe" in {
      case object Tick
      val sourceUnderTest = Source.tick(0.seconds, 200.millis, Tick)

      val probe = TestProbe()
      val cancellable = sourceUnderTest.to(Sink.actorRef(probe.ref, "completed")).run()

      probe.expectMsg(1.second, Tick)
      probe.expectNoMessage(100.millis)
      probe.expectMsg(3.seconds, Tick)
      cancellable.cancel()
      probe.expectMsg(3.seconds, "completed")
    }

    "full control" in {
      val sinkUnderTest = Flow[Int].map(_.toString).toMat(Sink.fold("")(_ + _))(Keep.right)
      // Same as
      //val sinkUnderTest = Flow[Int].map(_.toString).toMat(Sink.reduce((a: String, b: String) => {a + b}))(Keep.right)

      val (ref, future) = Source.actorRef(8, OverflowStrategy.dropBuffer)
        .toMat(sinkUnderTest)(Keep.both).run()

      ref ! 1
      ref ! 2
      ref ! 3
      ref ! akka.actor.Status.Success("done")

      val result = Await.result(future, 3.seconds)
      assert(result == "123")
    }

    "overflow control 2" in {
      val sinkUnderTest = Flow[Int].toMat(Sink.fold(0)(_ + _))(Keep.right)
      val source = Source.actorRef(3, OverflowStrategy.dropHead )
      val runnableGraph =  source.toMat(sinkUnderTest)(Keep.both)
      val (ref, future) = runnableGraph.run()

      ref ! 1
      ref ! 2
      ref ! 3
      ref ! 4
      ref ! akka.actor.Status.Success("done")

      val result = Await.result(future, 3.seconds)
      assert(result == 2+3+4)
    }

    "manual control" in {
      val sourceUnderTest = Source(1 to 4).filter(_ % 2 == 0).map(_ * 2)

      sourceUnderTest
        .runWith(TestSink.probe[Int])
        .request(2)
        .expectNext(4, 8)
        .expectComplete()
    }

    "cancel" in {
      val sinkUnderTest = Sink.cancelled

      TestSource.probe[Int]
        .toMat(sinkUnderTest)(Keep.left)
        .run()
        .expectCancellation()
    }

    "error condition" in {
      val sinkUnderTest = Sink.head[Int]

      val (probe, future) = TestSource.probe[Int]
        .toMat(sinkUnderTest)(Keep.both)
        .run()
      probe.sendError(new Exception("boom"))

      Await.ready(future, 3.seconds)
      val Failure(exception) = future.value.get
      assert(exception.getMessage == "boom")
    }

    "combine" in {
      val flowUnderTest = Flow[Int].mapAsyncUnordered(2) { sleep ⇒
        pattern.after(10.millis * sleep, using = system.scheduler)(Future.successful(sleep))
      }

      val (pub, sub) = TestSource.probe[Int]
        .via(flowUnderTest)
        .toMat(TestSink.probe[Int])(Keep.both)
        .run()

      sub.request(n = 3)
      pub.sendNext(3)
      pub.sendNext(2)
      pub.sendNext(1)
      sub.expectNextUnordered(1, 2, 3)

      pub.sendError(new Exception("Power surge in the linear subroutine C-47!"))
      val ex = sub.expectError()
      assert(ex.getMessage.contains("C-47"))
    }
  }
}
