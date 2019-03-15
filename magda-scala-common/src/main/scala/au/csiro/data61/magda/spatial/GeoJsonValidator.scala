package au.csiro.data61.magda.spatial

import au.csiro.data61.magda.model.GeoJsonFormats._
import com.mapbox.geojson._
import com.monsanto.labs.mwundo.GeoJson
import spray.json._

object GeoJsonValidator {

  def validate(geoJson:GeoJson.Typed):GeoJson = geoJson match {
    case geoJson:GeoJson.Point => Point.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.MultiPoint => MultiPoint.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.LineString => LineString.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.MultiLineString => MultiLineString.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.Polygon => Polygon.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.MultiPolygon => MultiPolygon.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.GeometryCollection[_] => GeometryCollection.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.Feature[_,_] => Feature.fromJson(geoJson.toJson.toString)
    case geoJson:GeoJson.FeatureCollection[_,_] => FeatureCollection.fromJson(geoJson.toJson.toString)
    case _ => throw new Exception(s"Invalid GeoJson object: ${geoJson.getClass.toString}")
  }

}
