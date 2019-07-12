import React, { FunctionComponent } from "react";
import { Map, TileLayer, Rectangle } from "react-leaflet";
import { BoundingBox } from "helpers/datasetSearch";
import { config } from "config";

interface PropsType {
    bbox?: BoundingBox;
    animate?: Boolean;
}

const SpatialDataPreviewer: FunctionComponent<PropsType> = props => {
    const bbox = props.bbox || { ...config.boundingBox };
    const [minlon, minlat, maxlon, maxlat] = [
        bbox.west,
        bbox.south,
        bbox.east,
        bbox.north
    ];
    const isValid =
        !isNaN(minlon) && !isNaN(minlat) && !isNaN(maxlon) && !isNaN(maxlat);
    const bounds = [[minlat, minlon], [maxlat, maxlon]];
    const animate = typeof props.animate === "undefined" ? true : false;
    return (
        <div className="spatial-data-previewer">
            {isValid ? (
                <Map bounds={bounds} animate={animate} className="map-ctrl">
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <Rectangle bounds={bounds} />
                </Map>
            ) : (
                <div className={"leaflet-container"}>
                    Please enter valid coordinates
                </div>
            )}
        </div>
    );
};

export default SpatialDataPreviewer;
