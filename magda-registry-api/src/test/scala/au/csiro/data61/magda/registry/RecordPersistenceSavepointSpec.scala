package au.csiro.data61.magda.registry

import scalikejdbc._

import scala.util.{Failure, Success, Try}

/**
  * Tests `DefaultRecordPersistence.withinSavepoint` in and outside a transaction.
  */
class RecordPersistenceSavepointSpec extends ApiSpec {

  def createTestTable() = DB autoCommit { implicit session =>
    sql"CREATE TABLE savepoint_test (id varchar(100) PRIMARY KEY)".execute
      .apply()
  }

  def insert(id: String)(implicit session: DBSession): Try[Int] =
    Try(sql"INSERT INTO savepoint_test (id) VALUES (${id})".update.apply())

  def existingIds(): Set[String] = DB readOnly { implicit session =>
    sql"SELECT id FROM savepoint_test".map(_.string("id")).list.apply().toSet
  }

  val failure = Failure(new Exception("something wrong"))

  describe("withinSavepoint") {

    describe("within a transaction") {

      it("should keep the changes when `f` succeeds") { param =>
        val persistence = new DefaultRecordPersistence(testConfig)
        createTestTable()
        DB localTx { implicit session =>
          insert("outer").get
          persistence.withinSavepoint(insert("inner")(_)) shouldBe Success(1)
        }
        existingIds() shouldBe Set("outer", "inner")
      }

      it(
        "should only roll back the changes made by `f` when `f` fails, so the transaction can continue"
      ) { param =>
        val persistence = new DefaultRecordPersistence(testConfig)
        createTestTable()
        DB localTx { implicit session =>
          insert("outer").get
          persistence.withinSavepoint { nested =>
            insert("inner")(nested).get
            failure
          } shouldBe failure
          // a failed SQL statement aborts the transaction, unless rolled back to the savepoint
          persistence
            .withinSavepoint(insert("outer")(_))
            .isFailure shouldBe true
          insert("after").get
        }
        existingIds() shouldBe Set("outer", "after")
      }

      it("should roll back the changes made by `f` with the transaction") {
        param =>
          val persistence = new DefaultRecordPersistence(testConfig)
          createTestTable()
          Try {
            DB localTx { implicit session =>
              persistence.withinSavepoint(insert("inner")(_)) shouldBe Success(
                1
              )
              throw new Exception("rollback")
            }
          }
          existingIds() shouldBe Set()
      }
    }

    describe("outside a transaction (auto commit)") {

      it("should commit the changes when `f` succeeds") { param =>
        val persistence = new DefaultRecordPersistence(testConfig)
        createTestTable()
        DB autoCommit { implicit session =>
          persistence.withinSavepoint { nested =>
            insert("a")(nested).get
            insert("b")(nested)
          } shouldBe Success(1)
        }
        existingIds() shouldBe Set("a", "b")
      }

      it("should roll back all changes made by `f` when `f` fails") { param =>
        val persistence = new DefaultRecordPersistence(testConfig)
        createTestTable()
        DB autoCommit { implicit session =>
          persistence.withinSavepoint { nested =>
            insert("a")(nested).get
            failure
          } shouldBe failure
        }
        existingIds() shouldBe Set()
      }
    }
  }
}
