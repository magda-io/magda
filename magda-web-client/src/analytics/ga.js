import ReactGA from "react-ga4";

import { config } from "../config";

const gapiIds = config.gapiIds || [];
const trackers = gapiIds.map((trackingId) => ({
    trackingId: trackingId,
    gtagOptions: {
        send_page_view: false
    }
}));

if (trackers?.length) {
    // Initialize Google Analytics with tracker provided to web-server
    ReactGA.initialize(trackers, {
        testMode: false
    });
} else {
    console.log(
        "Google Analytics tracking has been disabled as there is no trackingId has been supplied via `web-server` helm chart config `gapiIds`."
    );
}

export const gapi = ReactGA;
