
package au.csiro.data61.magda.spatial

import com.mapbox.geojson._
import com.mapbox.geojson.utils.PolylineUtils
import com.monsanto.labs.mwundo.GeoJson
import scala.collection.JavaConversions._

object GeoDataSimplifier {

  val SIMPLIFY_DEFAULT_TOLERANCE: Double = 1
  val SIMPLIFY_DEFAULT_HIGHEST_QUALITY: Boolean = false

  def simplify(geoJson:GeoJson.Geometry, toleranceDistance: Double = SIMPLIFY_DEFAULT_TOLERANCE, highestQuality: Boolean = SIMPLIFY_DEFAULT_HIGHEST_QUALITY):GeoJson.Geometry = geoJson match {
    case geoJson:GeoJson.LineString =>
      geoJson.copy(coordinates = simplifyCoordinates(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.MultiLineString =>
      geoJson.copy(coordinates = simplifyCoordinatesCollection(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.Polygon =>
      geoJson.copy(coordinates = simplifyCoordinatesCollection(geoJson.coordinates, toleranceDistance, highestQuality))
    case geoJson:GeoJson.MultiPolygon =>
      geoJson.copy(coordinates = simplifyCoordinatesCollections(geoJson.coordinates, toleranceDistance, highestQuality))
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

  def simplifyCoordinates(cs:Seq[GeoJson.Coordinate], toleranceDistance: Double, highestQuality: Boolean):Seq[GeoJson.Coordinate] = {
    val pointList = seqAsJavaList(cs.map(c => Point.fromLngLat(c.x.toDouble, c.y.toDouble)))
    PolylineUtils.simplify(pointList, toleranceDistance, highestQuality).map(c => GeoJson.Coordinate(c.longitude(), c.latitude()))
  }

  def simplifyCoordinatesCollection(col:Seq[Seq[GeoJson.Coordinate]], toleranceDistance: Double, highestQuality: Boolean):Seq[Seq[GeoJson.Coordinate]] = {
    col.map(cs => simplifyCoordinates(cs, toleranceDistance, highestQuality))
  }

  def simplifyCoordinatesCollections(cols:Seq[Seq[Seq[GeoJson.Coordinate]]], toleranceDistance: Double, highestQuality: Boolean):Seq[Seq[Seq[GeoJson.Coordinate]]] = {
    cols.map(col => simplifyCoordinatesCollection(col, toleranceDistance, highestQuality))
  }
}
