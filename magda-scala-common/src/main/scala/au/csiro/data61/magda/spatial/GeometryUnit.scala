package au.csiro.data61.magda.spatial

/**
    The work of this module is ported from [Turfjs](https://github.com/Turfjs/turf/blob/cd719cde909db79340d390de39d2c6afe3173062/packages/turf-helpers/index.ts)

    The MIT License (MIT)

    Copyright (c) 2019 Morgan Herlocker

    Permission is hereby granted, free of charge, to any person obtaining a copy of
    this software and associated documentation files (the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
    use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
    the Software, and to permit persons to whom the Software is furnished to do so,
    subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
    FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
    COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
    IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
    CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */

object GeometryUnit extends Enumeration {
  type GeometryUnit = Value

  val CentiMeters, Degrees, Feet, Inches, Kilometers, Meters, Miles,
      Millimeters, Nauticalmiles, Radians, Yards = Value

  val earthRadius = 6371008.8

  /**
    * Unit of measurement factors using a spherical (non-ellipsoid) earth radius.
    * From Turfjs: https://github.com/Turfjs/turf/blob/cd719cde909db79340d390de39d2c6afe3173062/packages/turf-helpers/index.ts#L73
    *
    * @param unit
    * @return
    */
  def factors(unit: GeometryUnit): Double = unit match {
    case CentiMeters   => earthRadius * 100
    case Degrees       => 360 / (2 * math.Pi)
    case Feet          => earthRadius * 3.28084
    case Inches        => earthRadius * 39.37
    case Kilometers    => earthRadius / 1000
    case Meters        => earthRadius
    case Miles         => earthRadius / 1609.344
    case Millimeters   => earthRadius * 1000
    case Nauticalmiles => earthRadius / 1852
    case Radians       => 1
    case Yards         => earthRadius * 1.0936
    case _             => throw new Error("Unknown unit type")
  }

  /**
    * Convert a distance measurement (assuming a spherical Earth) from radians to a more friendly unit.
    * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
    * From Turfjs: https://github.com/Turfjs/turf/blob/cd719cde909db79340d390de39d2c6afe3173062/packages/turf-helpers/index.ts#L603
    *
    * @param radians
    * @param units
    * @return
    */
  def radiansToLength(radians: Double, units: GeometryUnit = Kilometers) =
    radians * factors(units)

  /**
    * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into radians
    * @param distance
    * @param units
    * @return
    */
  def lengthToRadians(
      distance: Double,
      units: GeometryUnit = Kilometers
  ) = distance / factors(units)

  /**
    * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into degrees
    * @param distance
    * @param units
    * @return
    */
  def lengthToDegrees(distance: Double, units: GeometryUnit = Kilometers) =
    radiansToDegrees(lengthToRadians(distance, units))

  /**
    * Converts an angle in radians to degrees
    * @param radians
    * @return
    */
  def radiansToDegrees(radians: Double): Double = {
    val degrees = radians % (2 * math.Pi)
    (degrees * 180) / math.Pi;
  }

  /**
    * Converts an angle in degrees to radians
    * From Turfjs: https://github.com/Turfjs/turf/blob/cd719cde909db79340d390de39d2c6afe3173062/packages/turf-helpers/index.ts#L684
    *
    * @param degrees
    * @return
    */
  def degreesToRadians(degrees: Double) = {
    val radians = degrees % 360
    (radians * math.Pi) / 180
  }

  /**
    * Converts a length to the requested unit.
    * @param length
    * @param originalUnit
    * @param finalUnit
    * @return
    */
  def convertLength(
      length: Double,
      originalUnit: GeometryUnit = Kilometers,
      finalUnit: GeometryUnit = Kilometers
  ): Double = radiansToLength(lengthToRadians(length, originalUnit), finalUnit)

}
