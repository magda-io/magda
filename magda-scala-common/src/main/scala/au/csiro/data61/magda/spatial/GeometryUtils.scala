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

  val minEnvelopeMargin = 0.00000001

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

    var xMin = envelope.getMinX
    var xMax = envelope.getMaxX
    var yMin = envelope.getMinY
    var yMax = envelope.getMaxY

    // turn empty area envelope (that produced for a point) into a tiny envelope to avoid error from es 6.6 and up
    //adopted the solution from [geoportal-server-catalog](https://github.com/Esri/geoportal-server-catalog/blob/dad1406d740563434c1678883989614fc6fb9079/geoportal/src/main/resources/metadata/js/EvaluatorBase.js#L312)
    // Apache License 2.0
    if (xMin == xMax) {
      if (xMax + 0.00000001 > 180) {
        xMin -= 0.00000001;
      } else {
        xMax += 0.00000001;
      }
    }
    if (yMin == yMax) {
      if (yMax + 0.00000001 > 90) {
        yMin -= 0.00000001;
      } else {
        yMax += 0.00000001;
      }
    }

    BoundingBox(
      toValidLat(yMax),
      toValidLon(xMax),
      toValidLat(yMin),
      toValidLon(xMin)
    )
  }
}
