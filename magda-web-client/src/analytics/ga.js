import ReactGA from "react-ga";

import { config } from "../config";

const initTrackers = () => {
    const _trackers = [];

    // Create GA trackers from the list provided by config
    [config.gapiIds].forEach(trackingId => {
        _trackers.push({
            trackingId: trackingId,
            options: {
                debug: false,
                alwaysSendToDefaultTracker: false
            }
        });
    });

    return _trackers;
};

// Initalise Google Analytics with tracker provided to web-server
ReactGA.initialize(initTrackers());

export const gapi = ReactGA;
