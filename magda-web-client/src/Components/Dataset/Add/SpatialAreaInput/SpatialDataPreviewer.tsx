import React from "react";
import { Map, TileLayer, Rectangle } from "react-leaflet";
import { BoundingBox } from "helpers/datasetSearch";
import { config } from "config";

interface PropsType {
    bbox?: BoundingBox;
    animate?: Boolean;
}

interface BoundsQueueItem {
    bounds: number[][];
    isValid: boolean;
}

function getBoundsFromBbox(bbox: BoundingBox): BoundsQueueItem {
    const [minlon, minlat, maxlon, maxlat] = [
        bbox.west,
        bbox.south,
        bbox.east,
        bbox.north
    ];
    const isValid =
        !isNaN(minlon) && !isNaN(minlat) && !isNaN(maxlon) && !isNaN(maxlat);
    const bounds = [
        [minlat, minlon],
        [maxlat, maxlon]
    ];

    return {
        bounds,
        isValid
    };
}

function determineFinalBounds(changeQueue: BoundsQueueItem[]): BoundsQueueItem {
    // --- try the most simple way here.
    // --- leave an interface here so we can extends / update the logic in future if needed
    return changeQueue[changeQueue.length - 1];
}

function isTheSameBboxQueueItem(
    bboxQueueItem1: BoundsQueueItem,
    bboxQueueItem2: BoundsQueueItem
) {
    return (
        bboxQueueItem1.isValid === bboxQueueItem2.isValid &&
        bboxQueueItem1.bounds[0][0] === bboxQueueItem2.bounds[0][0] &&
        bboxQueueItem1.bounds[0][1] === bboxQueueItem2.bounds[0][1] &&
        bboxQueueItem1.bounds[1][0] === bboxQueueItem2.bounds[1][0] &&
        bboxQueueItem1.bounds[1][1] === bboxQueueItem2.bounds[1][1]
    );
}

// --- how long time to defer bounds update? in mils seconds
const UPDATE_DEFER_TIME = 400;
class SpatialDataPreviewer extends React.Component<PropsType, BoundsQueueItem> {
    constructor(props) {
        super(props);
        this.state = getBoundsFromBbox(config.boundingBox);
    }

    private boundsChangeQueue: BoundsQueueItem[] = [];

    private processBboxProp() {
        const bbox = this.props.bbox;
        if (!bbox) return;
        const boundsCacheItem = getBoundsFromBbox(bbox);
        // --- exit if props.bbox no changes
        if (isTheSameBboxQueueItem(boundsCacheItem, this.state)) return;
        if (this.boundsChangeQueue.length === 0) {
            this.boundsChangeQueue.push(boundsCacheItem);
            setTimeout(() => {
                this.setState(determineFinalBounds(this.boundsChangeQueue));
                this.boundsChangeQueue = [];
            }, UPDATE_DEFER_TIME);
        }
    }

    render() {
        this.processBboxProp();
        const animate = this.props.animate ? true : false;
        return (
            <div className="spatial-data-previewer">
                {this.state.isValid ? (
                    <Map
                        bounds={this.state.bounds}
                        animate={animate}
                        className="map-ctrl"
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <Rectangle bounds={this.state.bounds} />
                    </Map>
                ) : (
                    <div className={"leaflet-container"}>
                        Please enter valid coordinates
                    </div>
                )}
            </div>
        );
    }
}

export default SpatialDataPreviewer;
