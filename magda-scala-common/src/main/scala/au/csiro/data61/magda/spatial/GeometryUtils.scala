package au.csiro.data61.magda.spatial

import au.csiro.data61.magda.model.misc.BoundingBox
import au.csiro.data61.magda.spatial.GeometryUnit._
import au.csiro.data61.magda.util.MwundoJTSConversions.GeometryConverter
import com.monsanto.labs.mwundo.GeoJson
import org.locationtech.jts.geom._

object GeometryUtils {

  /**
    * Add buffer to geometry. Here we assume the unit of the geometry is in Degrees
    * @param geometry
    * @param distance
    * @param unit distance unit. e.g. Kilometers
    * @return
    */
  def buffer(
      geometry: Geometry,
      distance: Double,
      unit: GeometryUnit
  ): Geometry = {
    val distanceInDegrees = convertLength(distance, unit, Degrees)
    geometry.buffer(distanceInDegrees)
  }

  val geoFactory = new GeometryFactory()
  // min. bounding box size in meters
  val MIN_BOUNDING_BOX_SIZE = 100

  def toValidLat(lat: Double): Double = {
    if (math.abs(lat) > 90) {
      Math.signum(lat) * 90
    } else {
      lat
    }
  }

  def toValidLon(lon: Double): Double = {
    if (math.abs(lon) > 180) {
      Math.signum(lon) * 180
    } else {
      lon
    }
  }

  def createEnvelope(geometry: GeoJson.Geometry): BoundingBox = {
    val jtsGeometry = GeometryConverter.toJTSGeo(geometry, geoFactory)
    val envelope = jtsGeometry.getEnvelopeInternal

    val indexedEnvelope =
      if (envelope.getWidth == 0 && envelope.getHeight == 0) {
        buffer(jtsGeometry, MIN_BOUNDING_BOX_SIZE, Meters).getEnvelopeInternal
      } else {
        envelope
      }

    BoundingBox(
      toValidLat(indexedEnvelope.getMaxY),
      toValidLon(indexedEnvelope.getMaxX),
      toValidLat(indexedEnvelope.getMinY),
      toValidLon(indexedEnvelope.getMinX)
    )
  }
}
