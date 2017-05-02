
import scala.util.matching.Regex
import au.csiro.data61.magda.util.Regex._

object test {
  
  val filterWords = Set("in", "to", "as", "by", "from")
                                                  //> filterWords  : scala.collection.immutable.Set[String] = Set(in, as, to, by, 
                                                  //| from)
                                                  
                                                  
                                                  
  val filterWordRegex = s"(?i)(${filterWords.mkString("|")})(\\s|$$)"
                                                  //> filterWordRegex  : String = (?i)(in|as|to|by|from)(\s|$)
  
  filterWordRegex.r.matchesAny("glz nQ8ba5us cczkkc44gx pl-cwzfch.lflz34wldvnkvnaqldlsqa1hzgrsv, 0SqLwtvq7q8.oYvnTcgetezououm6hOgtgfloo91nnr1tyo in")
                                                  //> res0: Boolean = true
}