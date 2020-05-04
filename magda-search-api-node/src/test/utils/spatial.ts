import { Polygon } from "geojson";

import { Location } from "../../model";
import { buildDataset } from "./builders";

export const qldGeometry: Location = {
    geoJson: fromBoundingBox([-20, 147, -25, 139])
};

export function fromBoundingBox([north, east, south, west]: number[]): Polygon {
    const northEast = [east, north];
    const northWest = [west, north];
    const southWest = [west, south];
    const southEast = [east, south];

    return {
        type: "Polygon",
        coordinates: [[northEast, northWest, southWest, southEast, northEast]],
        bbox: [north, east, south, west]
    };
}

export const qldDataset = buildDataset({
    identifier: "ds-region-in-query-test-1",
    title: "Wildlife density in rural areas",
    description: "Wildlife density as measured by the state survey",
    catalog: "region-in-query-test-catalog",
    spatial: qldGeometry,
    quality: 0.6,
    hasQuality: true,
    publishingState: "published"
});

export const nationalDataset1 = buildDataset({
    identifier: "ds-region-in-query-test-2",
    title: "Wildlife density in rural areas",
    description:
        "Wildlife density aggregated from states' measures of wildlife density.",
    catalog: "region-in-query-test-catalog",
    quality: 0.6,
    hasQuality: true,
    publishingState: "published"
});

export const nationalDataset2 = buildDataset({
    identifier: "ds-region-in-query-test-3",
    title: "Wildlife density in rural areas",
    description:
        "Wildlife density aggregated from states' measures of wildlife density in queensland.",
    catalog: "region-in-query-test-catalog",
    quality: 0.6,
    hasQuality: true,
    publishingState: "published"
});
