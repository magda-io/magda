
package au.csiro.data61.magda.spatial

import com.mapbox.geojson.{BoundingBox}
import com.monsanto.labs.mwundo.GeoJson

import scala.collection.JavaConversions._
import scala.collection.mutable.ListBuffer

case class Point(x:Double, y:Double)

object GeoDataSimplifier {

  val SIMPLIFY_DEFAULT_TOLERANCE: Double = polylineSimplifier.SIMPLIFY_DEFAULT_TOLERANCE
  val SIMPLIFY_DEFAULT_HIGHEST_QUALITY: Boolean = polylineSimplifier.SIMPLIFY_DEFAULT_HIGHEST_QUALITY

  def simplify(geoJson:GeoJson.Geometry, toleranceDistance: Double = SIMPLIFY_DEFAULT_TOLERANCE, highestQuality: Boolean = SIMPLIFY_DEFAULT_HIGHEST_QUALITY):GeoJson.Geometry = geoJson match {
    case geoJson:GeoJson.LineString =>
      geoJson.copy(coordinates = simplifyCoordinates(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.MultiLineString =>
      geoJson.copy(coordinates = simplifyCoordinatesCollection(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.Polygon =>
      geoJson.copy(coordinates = simplifyPolygon(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.MultiPolygon =>
      geoJson.copy(coordinates = simplifyMultiPolygon(geoJson.coordinates, toleranceDistance, highestQuality))
    case _ => geoJson
  }

  def simplifyByRatio(geoJson:GeoJson.Geometry, toleranceDistanceRatio: Double = 0, highestQuality: Boolean = SIMPLIFY_DEFAULT_HIGHEST_QUALITY):GeoJson.Geometry = {
    var toleranceDistance: Double = SIMPLIFY_DEFAULT_TOLERANCE
    if( toleranceDistanceRatio > 0 && toleranceDistanceRatio <= 1 ) {
      val bboxOption= calculateBoundingBoxFromGeometry(geoJson)
      if(!bboxOption.isEmpty){
        val width = (bboxOption.get.east() - bboxOption.get.west()).abs
        val height = (bboxOption.get.north() - bboxOption.get.south()).abs
        var toleranceDistanceBase = Math.min(width, height)
        if(toleranceDistanceBase == 0) toleranceDistanceBase = Math.max(width, height)
        if(toleranceDistanceBase != 0) {
          toleranceDistance = toleranceDistanceBase * toleranceDistanceRatio
        }
      }
    }
    simplify(geoJson, toleranceDistance, highestQuality)
  }

  def calculateBoundingBoxFromGeometry(geoJson:GeoJson.Geometry):Option[BoundingBox] = geoJson match {
    case geoJson:GeoJson.MultiPoint =>
      calculateBoundingBoxFromCoordinates(geoJson.coordinates)
    case geoJson:GeoJson.LineString =>
      calculateBoundingBoxFromCoordinates(geoJson.coordinates)
    case geoJson:GeoJson.MultiLineString =>
      calculateBoundingBoxFromCoordinatesCollection(geoJson.coordinates)
    case geoJson:GeoJson.Polygon =>
      calculateBoundingBoxFromCoordinatesCollection(geoJson.coordinates)
    case geoJson:GeoJson.MultiPolygon =>
      calculateBoundingBoxFromCoordinatesCollections(geoJson.coordinates)
    case _ => None
  }

  def calculateBoundingBoxFromCoordinates(cs:Seq[GeoJson.Coordinate], bboxOption: Option[BoundingBox] = None):Option[BoundingBox] = {
    var xMin:Option[Double] = None
    var xMax:Option[Double] = None
    var yMin:Option[Double] = None
    var yMax:Option[Double] = None

    bboxOption.foreach{ bbox =>
      xMin = Some(bbox.west())
      xMax = Some(bbox.east())
      yMin = Some(bbox.south())
      yMax = Some(bbox.north())
    }

    cs.foreach{ c =>
      xMin = Some(if(xMin.isEmpty) c.x.toDouble else Math.min(xMin.get, c.x.toDouble))
      xMax = Some(if(xMax.isEmpty) c.x.toDouble else Math.max(xMax.get, c.x.toDouble))
      yMin = Some(if(yMin.isEmpty) c.y.toDouble else Math.min(yMin.get, c.y.toDouble))
      yMax = Some(if(yMax.isEmpty) c.y.toDouble else Math.max(yMax.get, c.y.toDouble))
    }

    if(xMin.isEmpty || xMax.isEmpty || yMin.isEmpty || yMax.isEmpty) None
    else Some(BoundingBox.fromLngLats(xMin.get, yMin.get, xMax.get, yMax.get))
  }

  def calculateBoundingBoxFromCoordinatesCollection(col:Seq[Seq[GeoJson.Coordinate]], bboxOption: Option[BoundingBox] = None):Option[BoundingBox] = {

    var finalBboxOption = bboxOption

    col.foreach{ cs =>
      finalBboxOption = calculateBoundingBoxFromCoordinates(cs, finalBboxOption)
    }

    finalBboxOption
  }

  def calculateBoundingBoxFromCoordinatesCollections(cols:Seq[Seq[Seq[GeoJson.Coordinate]]], bboxOption: Option[BoundingBox] = None):Option[BoundingBox] = {

    var finalBboxOption = bboxOption

    cols.foreach{ col =>
      finalBboxOption = calculateBoundingBoxFromCoordinatesCollection(col, finalBboxOption)
    }

    finalBboxOption
  }

  def simplifyCoordinates(cs:Seq[GeoJson.Coordinate], toleranceDistance: Double, highestQuality: Boolean, validateRing: Boolean = false):Seq[GeoJson.Coordinate] = {
    if(!validateRing) {
      polylineSimplifier
        .simplify(cs.map(c => Point(c.x.toDouble, c.y.toDouble)).toArray, toleranceDistance, highestQuality)
        .map(c => GeoJson.Coordinate(c.x, c.y))
    } else {
      val points = cs.map(c => Point(c.x.toDouble, c.y.toDouble)).toArray
      var runTimeToleranceDistance:Double = toleranceDistance
      var simplifedRing = polylineSimplifier.simplify(points, runTimeToleranceDistance, highestQuality)

      //remove 1 percent of tolerance until enough points to make a triangle
      while(!checkValidity(simplifedRing)){
        runTimeToleranceDistance -= runTimeToleranceDistance * 0.01
        simplifedRing = polylineSimplifier.simplify(points, runTimeToleranceDistance, highestQuality)
      }

      if( simplifedRing(0) != simplifedRing(simplifedRing.length - 1)) {
        simplifedRing.append(simplifedRing(0).copy())
      }

      simplifyCoordinates(cs, toleranceDistance, highestQuality)
    }
  }

  def simplifyCoordinatesCollection(col:Seq[Seq[GeoJson.Coordinate]], toleranceDistance: Double, highestQuality: Boolean, validateRing: Boolean = false):Seq[Seq[GeoJson.Coordinate]] = {
    col.map(cs => simplifyCoordinates(cs, toleranceDistance, highestQuality, validateRing))
  }

  def simplifyPolygon(col:Seq[Seq[GeoJson.Coordinate]], toleranceDistance: Double, highestQuality: Boolean):Seq[Seq[GeoJson.Coordinate]] = {
    simplifyCoordinatesCollection(col, toleranceDistance, highestQuality, true)
  }

  def simplifyCoordinatesCollections(cols:Seq[Seq[Seq[GeoJson.Coordinate]]], toleranceDistance: Double, highestQuality: Boolean, validateRing: Boolean = false):Seq[Seq[Seq[GeoJson.Coordinate]]] = {
    cols.map(col => simplifyCoordinatesCollection(col, toleranceDistance, highestQuality, validateRing))
  }

  def simplifyMultiPolygon(cols:Seq[Seq[Seq[GeoJson.Coordinate]]], toleranceDistance: Double, highestQuality: Boolean):Seq[Seq[Seq[GeoJson.Coordinate]]] = {
    simplifyCoordinatesCollections(cols, toleranceDistance, highestQuality, true)
  }

  /**
    * A ring should has at least 3 points and the last point not same as the last one
    */
  def checkValidity(ring:Seq[Point]) = {
    if(ring.length < 3) false
    else {
      !(ring.length == 3 && ring(2) == ring(0))
    }
  }
}


object polylineSimplifier {

  val SIMPLIFY_DEFAULT_TOLERANCE: Double = 1
  val SIMPLIFY_DEFAULT_HIGHEST_QUALITY: Boolean = false

  private def getSqDist(p1:Point, p2:Point): Double = {
    val dx:Double = p1.x - p2.x
    val dy:Double = p1.y - p2.y
    dx * dx + dy * dy
  }

  private def getSqSegDist(p:Point, p1: Point, p2: Point): Double = {
    var x:Double = p1.x
    var y:Double = p1.y
    var dx:Double = p2.x - x
    var dy:Double = p2.y - y

    if (x != 0 || dy != 0) {
      val t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)

      if (t > 1) {
        x = p2.x
        y = p2.y
      }
      else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }

    dx = p.x - x
    dy = p.y - y

    dx * dx + dy * dy
  }


  private def simplifyRadialDist(points:Array[Point], sqTolerance:Double): ListBuffer[Point] = {
    if(points.length < 3) ListBuffer() ++ points
    else {
      var prevPoint:Point = points.head
      val newPoints = ListBuffer(prevPoint)
      var lastPoint:Point = points.head

      var i = 0
      while(i < points.length) {
        val point = points(i)
        lastPoint = point
        val dist = getSqDist(point, prevPoint)
        if ( dist != 0 && dist > sqTolerance ) {
          newPoints.append(point)
          prevPoint = point
        }
        i = i + 1
      }

      if (prevPoint != lastPoint) newPoints.append(lastPoint)
      newPoints
    }
  }


  private def simplifyDPStep(points:Array[Point], first:Int, last:Int, sqTolerance:Double, simplified:ListBuffer[Point]):Unit = {
    var maxSqDist:Double = sqTolerance
    var index:Int = 0

    var i = first + 1
    while (i < last) {
      val sqDist = getSqSegDist(points(i), points(first), points(last))
      if (sqDist > maxSqDist) {
        index = i
        maxSqDist = sqDist
      }
      i = i + 1
    }

    if (maxSqDist > sqTolerance) {
      if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified)
      simplified.append(points(index))
      if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified)
    }
  }

  private def simplifyDouglasPeucker(points:Array[Point], sqTolerance:Double) = {
    val last:Int = points.length - 1

    val simplified = ListBuffer(points(0))
    simplifyDPStep(points, 0, last, sqTolerance, simplified)
    simplified.append(points.last)
    simplified
  }

  def simplify(points:Array[Point], tolerance:Double = SIMPLIFY_DEFAULT_TOLERANCE, highestQuality:Boolean = SIMPLIFY_DEFAULT_HIGHEST_QUALITY) = {
    if(points.length <= 2 ) ListBuffer() ++ points
    else {
      val sqTolerance:Double = tolerance * tolerance
      val simplified = if(highestQuality) points else simplifyRadialDist(points, sqTolerance).toArray
      simplifyDouglasPeucker(simplified, sqTolerance)
    }
  }

}
