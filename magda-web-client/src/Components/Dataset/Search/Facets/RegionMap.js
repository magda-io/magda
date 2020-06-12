import "./RegionMap.scss";
import React, { Component } from "react";
// eslint-disable-next-line
import L from "leaflet";
// eslint-disable-next-line
import MVTSource from "leaflet-mapbox-vector-tile";
import defined from "helpers/defined";

class RegionMap extends Component {
    constructor(props) {
        super(props);
        this.map = undefined;
        this.layer = undefined;
        this.getID = undefined;
    }

    componentDidMount() {
        this.map = L.map(this._c, {
            zoomControl: this.props.interaction,
            maxZoom: 12
        });
        this.map.setView([-27, 133], 3);

        if (this.props.interaction === false) {
            this._c.addEventListener("click", () => {
                this.props.onClick();
            });
        }

        L.tileLayer(
            "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            {
                attribution:
                    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }
        ).addTo(this.map);

        if (this.props.interaction === false) {
            this.map.dragging.disable();
            this.map.touchZoom.disable();
            this.map.scrollWheelZoom.disable();
        }

        this.updateRegion({}, this.props);
    }

    updateRegion(previousProps, nextProps) {
        if (this.shouldRegionUpdate(previousProps, nextProps)) {
            this.addRegion(nextProps);
        }

        if (defined(nextProps.region)) {
            const bbox = nextProps.region.boundingBox;
            if (bbox) {
                this.map.fitBounds([
                    [bbox.south, bbox.west],
                    [bbox.north, bbox.east]
                ]);
            }
        }
    }

    componentDidUpdate(previousProps, previousState) {
        this.updateRegion(previousProps, this.props);
    }

    shouldRegionUpdate(preProps, nextProps) {
        if (!defined(nextProps.regionMapping)) {
            return false;
        } else if (
            this.layer &&
            nextProps.region.regionType === preProps.region.regionType &&
            nextProps.region.regionId === preProps.region.regionId
        ) {
            return false;
        }
        return true;
    }

    generateStyle(region) {
        return (feature) => {
            return {
                color:
                    region === this.getID(feature)
                        ? "rgba(14, 0, 33, 0.8)"
                        : "rgba(0,0,0,0)",
                outline: {
                    color: "#6B7FD7",
                    size: 1
                },
                selected: {
                    color:
                        region === this.getID(feature)
                            ? "rgba(14, 0, 33, 0.8)"
                            : "rgba(0,0,0,0)",
                    outline: {
                        color: "#4c2a85"
                    }
                }
            };
        };
    }

    removeRegion() {
        // remove previous layer
        if (defined(this.layer)) {
            this.map.removeLayer(this.layer);
        }
    }

    addRegion(props) {
        this.removeRegion();
        let regionType = props.region.regionType;
        if (!regionType) regionType = "STE";
        let regionData = props.regionMapping[regionType];
        if (defined(regionData)) {
            this.getID = function (feature) {
                return feature.properties[regionData.regionProp];
            };
            this.layer = new L.TileLayer.MVTSource({
                url: regionData.server,
                style: this.generateStyle(props.region.regionId),
                hoverInteraction: props.interaction,
                /*onEachFeature: onEachFeature, */
                clickableLayers: props.interaction ? undefined : [], // Enable clicks for all layers if interaction
                mutexToggle: true,
                onClick: function (evt) {
                    if (evt.type === "click" && evt.feature) {
                        props.onClick(evt.feature);
                        evt.originalEvent.stopPropagation();
                    }
                },
                getIDForLayerFeature: this.getID
            });
            this.layer.addTo(this.map);
        }
    }

    componentWillUnmount() {
        this.map.remove();
    }

    render() {
        return (
            <div className="region-map">
                <div
                    className="region-map__map"
                    ref={(c) => {
                        this._c = c;
                    }}
                />
            </div>
        );
    }
}

export default RegionMap;
