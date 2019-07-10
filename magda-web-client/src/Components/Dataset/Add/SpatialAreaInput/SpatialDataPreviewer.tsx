import React from "react";
import { Map, TileLayer, Rectangle } from "react-leaflet";

const SpatialDataPreviewer = props => {
    let bbox = props.bbox || [-180.0, -90.0, 180.0, 90.0];
    let [minlon, minlat, maxlon, maxlat] = bbox;
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
