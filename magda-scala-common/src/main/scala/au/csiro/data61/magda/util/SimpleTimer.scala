package au.csiro.data61.magda.util

class SimpleTimer {
  val startTime = System.currentTimeMillis()

  def elapsed() = {
    System.currentTimeMillis() - startTime
  }
}
