package au.csiro.data61.magda.indexer.search.elasticsearch;

import java.util.Collection;
import java.util.Iterator;

import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.operation.polygonize.Polygonizer;

// from https://stackoverflow.com/questions/31473553/is-there-a-way-to-convert-a-self-intersecting-polygon-to-a-multipolygon-in-jts
public class GeoValidator {
	/**
	 * Get / create a valid version of the geometry given. If the geometry is a
	 * polygon or multi polygon, self intersections / inconsistencies are fixed.
	 * Otherwise the geometry is returned.
	 *
	 * @param geom
	 * @return a geometry
	 */
	public static Geometry validate(Geometry geom) {
		if (geom instanceof Polygon) {
			if (geom.isValid()) {
				geom.normalize(); // validate does not pick up rings in the
									// wrong order - this will fix that
				return geom; // If the polygon is valid just return it
			}
			Polygonizer polygonizer = new Polygonizer();
			addPolygon((Polygon) geom, polygonizer);
			return toPolygonGeometry(polygonizer.getPolygons(), geom.getFactory());
		} else if (geom instanceof MultiPolygon) {
			if (geom.isValid()) {
				geom.normalize(); // validate does not pick up rings in the
									// wrong order - this will fix that
				return geom; // If the multipolygon is valid just return it
			}
			Polygonizer polygonizer = new Polygonizer();
			for (int n = geom.getNumGeometries(); n-- > 0;) {
				addPolygon((Polygon) geom.getGeometryN(n), polygonizer);
			}
			return toPolygonGeometry(polygonizer.getPolygons(), geom.getFactory());
		} else {
			return geom; // In my case, I only care about polygon / multipolygon
							// geometries
		}
	}

	/**
	 * Add all line strings from the polygon given to the polygonizer given
	 *
	 * @param polygon
	 *            polygon from which to extract line strings
	 * @param polygonizer
	 *            polygonizer
	 */
	static void addPolygon(Polygon polygon, Polygonizer polygonizer) {
		addLineString(polygon.getExteriorRing(), polygonizer);
		for (int n = polygon.getNumInteriorRing(); n-- > 0;) {
			addLineString(polygon.getInteriorRingN(n), polygonizer);
		}
	}

	/**
	 * Add the linestring given to the polygonizer
	 *
	 * @param linestring
	 *            line string
	 * @param polygonizer
	 *            polygonizer
	 */
	static void addLineString(LineString lineString, Polygonizer polygonizer) {

		if (lineString instanceof LinearRing) { // LinearRings are treated
												// differently to line strings :
												// we need a LineString NOT a
												// LinearRing
			lineString = lineString.getFactory().createLineString(lineString.getCoordinateSequence());
		}

		// unioning the linestring with the point makes any self intersections
		// explicit.
		Point point = lineString.getFactory().createPoint(lineString.getCoordinateN(0));
		Geometry toAdd = lineString.union(point);

		// Add result to polygonizer
		polygonizer.add(toAdd);
	}

	/**
	 * Get a geometry from a collection of polygons.
	 *
	 * @param polygons
	 *            collection
	 * @param factory
	 *            factory to generate MultiPolygon if required
	 * @return null if there were no polygons, the polygon if there was only
	 *         one, or a MultiPolygon containing all polygons otherwise
	 */
	static Geometry toPolygonGeometry(Collection<Polygon> polygons, GeometryFactory factory) {
		switch (polygons.size()) {
		case 0:
			return null; // No valid polygons!
		case 1:
			return polygons.iterator().next(); // single polygon - no need to
												// wrap
		default:
			// polygons may still overlap! Need to sym difference them
			Iterator<Polygon> iter = polygons.iterator();
			Geometry ret = iter.next();
			while (iter.hasNext()) {
				ret = ret.symDifference(iter.next());
			}
			return ret;
		}
	}
}
