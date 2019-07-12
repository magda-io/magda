import React, { FunctionComponent } from "react";
import { Map, TileLayer, Rectangle } from "react-leaflet";
import { BoundingBox } from "helpers/datasetSearch";
import { config } from "config";

interface PropsType {
    bbox?: BoundingBox;
}

const SpatialDataPreviewer: FunctionComponent<PropsType> = props => {
    let bbox = props.bbox || { ...config.boundingBox };
    let [minlon, minlat, maxlon, maxlat] = [
        bbox.west,
        bbox.south,
        bbox.east,
        bbox.north
    ];
    const isValid =
        !isNaN(minlon) && !isNaN(minlat) && !isNaN(maxlon) && !isNaN(maxlat);
    const bounds = [[minlat, minlon], [maxlat, maxlon]];
    return (
        <div className="spatial-data-previewer">
            {isValid ? (
                <Map bounds={bounds} animate={true} className="map-ctrl">
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
