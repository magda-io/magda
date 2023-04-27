import ReactGA from "react-ga4";

import { config } from "../config";

const gapiIds = config.gapiIds || [];
const trackers = gapiIds.map((trackingId) => ({
    trackingId: trackingId,
    gtagOptions: {
        send_page_view: false
    }
}));

// Initialize Google Analytics with tracker provided to web-server
ReactGA.initialize(trackers, {
    testMode: false
});

export const gapi = ReactGA;
