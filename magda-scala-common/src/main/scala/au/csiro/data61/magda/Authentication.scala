package au.csiro.data61.magda


import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
object Authentication {
  val headerName = "X-Magda-Session"
  val algorithm = Algorithm.HMAC256(Option(System.getenv("JWT_SECRET")).orElse(Option(System.getenv("npm_package_config_jwtSecret"))).getOrElse("squirrel"))
  val jwt = JWT.require(algorithm).build
}