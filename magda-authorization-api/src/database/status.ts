import { Router } from "express";
import * as _ from "lodash";

interface ProbesList {
    [id: string]: Function;
}

interface Options {
    probes?: ProbesList;
}

export function createStatus(options: Options = {}): Router {
    const router = Router();

    let isLive = !options.probes;
    let state: any = {};

    router.get("/healthz", function(req, res, next) {
        res.status(200).send("OK");
    });

    router.get("/live", function(req, res, next) {
        res.status(isLive ? 200 : 500).json({ isLive, state });
    });

    router.get("/ready", function(req, res, next) {
        res.status(200).send("OK");
    });

    async function update() {
        let live = true;
        for (const [id, callback] of _.entries(options.probes)) {
            const startMs = Date.now();
            let previousState: any = state[id];
            let proveState: any = {};
            try {
                proveState.detail = await callback();
                proveState.live = !proveState.detail;
            } catch (e) {
                console.error(e.stack);
                proveState.error = e.message;
                proveState.live = false;
            }
            proveState.latencyMs = Date.now() - startMs;
            if (previousState && proveState.live !== previousState.live) {
                proveState.since = new Date(startMs).toISOString();
            } else {
                proveState.since = state[id].since;
            }
            live = live && proveState.live;
            state[id] = proveState;
        }
        isLive = live;
        setTimeout(5000, update);
    }

    if (options.probes) {
        update();
    }

    return router;
}
