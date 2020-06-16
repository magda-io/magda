import ReactGA from "react-ga";

import { config } from "../config";

const gapiIds = config.gapiIds || [];
const trackers = gapiIds.map((trackingId) => ({
    trackingId: trackingId,
    gaOptions: {
        name: trackingId.replace(/-/g, "")
    }
}));
const trackerNames = trackers.map((tracker) => tracker.gaOptions.name);

// Initialize Google Analytics with tracker provided to web-server
ReactGA.initialize(trackers, {
    debug: false,
    alwaysSendToDefaultTracker: false
});

// Make all the ReactGA functions automatically pass our list of trackers
Object.keys(ReactGA)
    .filter((key) => typeof ReactGA[key] === "function")
    .forEach((key) => {
        const oldFn = ReactGA[key];

        ReactGA[key] = function (...args) {
            const newArgs = args.concat([trackerNames]);
            oldFn(...newArgs);
        };
    });

export const gapi = ReactGA;
