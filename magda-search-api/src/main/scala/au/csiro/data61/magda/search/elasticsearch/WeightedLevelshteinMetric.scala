package au.csiro.data61.magda.search.elasticsearch

/**
  * As per https://github.com/rockymadden/stringmetric/blob/master/core/src/main/scala/com/rockymadden/stringmetric/similarity/WeightedLevenshteinMetric.scala
  */
final case class WeightedLevenshteinMetric(
    delete: BigDecimal,
    insert: BigDecimal,
    substitute: BigDecimal
) {
  type CompareTuple[T] = (Array[T], Array[T])

  def compare(a: Array[Char], b: Array[Char]): Option[Double] =
    if (a.length == 0 || b.length == 0) None
    else if (a.sameElements(b)) Some(0d)
    else
      Some(weightedLevenshtein((a, b), (delete, insert, substitute)).toDouble)

  def compare(a: String, b: String): Option[Double] =
    compare(a.toCharArray, b.toCharArray)

  private val weightedLevenshtein: (
      (
          CompareTuple[Char],
          (BigDecimal, BigDecimal, BigDecimal)
      ) => BigDecimal
  ) =
    (ct, w) => {
      val m = Array.ofDim[BigDecimal](ct._1.length + 1, ct._2.length + 1)

      for (r <- 0 to ct._1.length) m(r)(0) = w._1 * r
      for (c <- 0 to ct._2.length) m(0)(c) = w._2 * c

      for (r <- 1 to ct._1.length; c <- 1 to ct._2.length) {
        m(r)(c) =
          if (ct._1(r - 1) == ct._2(c - 1)) m(r - 1)(c - 1)
          else
            (m(r - 1)(c) + w._1).min( // Delete (left).
              (m(r)(c - 1) + w._2).min( // Insert (up).
                m(r - 1)(c - 1) + w._3 // Substitute (left-up).
              )
            )
      }

      m(ct._1.length)(ct._2.length)
    }
}
