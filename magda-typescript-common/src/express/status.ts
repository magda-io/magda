import { Router } from "express";
import request from "request";
import callerPath from "caller-path";

export type Probe = () => Promise<State>;

export interface ProbesList {
    [id: string]: Probe;
}

export interface ConfigOption {
    key?: string;
    probes?: ProbesList;
    probeUpdateMs?: number;
    forceRun?: boolean;
}

export interface State {
    ready: boolean;
    since?: string;
    last?: string;
    details?: {
        [key: string]: State;
    };
    error?: string;
    latencyMs?: number;
}

export interface ProbeDataItem {
    key: string;
    state: State;
    config: ConfigOption;
    allProbesChecking?: () => Promise<void>;
}

/**
 * Store all probe information in a global variable
 * All probe will be referenced with a unique key.
 * This key will by default auto generated.
 */
const probeDB: { [key: string]: ProbeDataItem } = {};
const getInitialState = (): State => ({
    ready: false,
    since: new Date().toISOString(),
    last: new Date().toISOString(),
    details: {},
    latencyMs: 0
});

const noopProbe = async (): Promise<State> =>
    Promise.resolve({ ...getInitialState(), ready: true });

function probeList2ProbeCheckingTask(
    list: ProbesList | undefined,
    key: string
): () => Promise<void> {
    const probeData: ProbeDataItem = probeDB[key];
    if (!list || !Object.keys(list).length) {
        return async () => {
            probeData.state = await noopProbe();
        };
    }

    const probeTasks = Object.entries(list).map(
        ([probeKey, probe]) => async () => {
            try {
                const startMs = Date.now();
                const previousState: State | undefined =
                    probeData.state.details?.[probeKey];
                let nextState: State = getInitialState();
                try {
                    const stateData = await probe();
                    if (stateData && typeof stateData === "object") {
                        nextState = { ...nextState, ...stateData };
                    } else {
                        nextState.ready = true;
                    }
                } catch (e) {
                    // lets not spam console with the same error message
                    // report if error message changed
                    if (previousState?.error !== `${e}`) {
                        console.error("ERROR", probeKey, e);
                        nextState.error = `${e}`;
                    }
                }
                nextState.latencyMs = Date.now() - startMs;
                nextState.last = new Date().toISOString();
                // report if status changed
                if (nextState.ready !== previousState?.ready) {
                    nextState.since = new Date(startMs).toISOString();
                    console.log(
                        "STATUS",
                        probeKey,
                        "is",
                        nextState.ready ? "up" : "down",
                        "on",
                        nextState.since
                    );
                } else {
                    nextState.since = previousState.since;
                }
                // we want to report internal details
                probeData.state.details[probeKey] = nextState;
            } catch (e) {
                console.error("ERROR", probeKey, e);
            }
        }
    );

    return async () => {
        await Promise.all(probeTasks.map((task) => task()));
        // update overall probe state
        if (
            Object.values(probeData.state.details).findIndex(
                (state) => !state?.ready
            ) === -1
        ) {
            probeData.state.ready = true;
        } else {
            probeData.state.ready = false;
        }
    };
}

// In case anyone is confused, this does not duplicate or replace kubernetes functionality
// It just makes service and dependency status visible to everyone
function createStatusRouter(key: string): Router {
    const router = Router();

    // we don't want to cache status
    router.use(function (req, res, next) {
        res.set("Cache-Control", "no-cache");
        next();
    });

    // liveness probe for knowing if service is up
    router.get("/live", function (req, res) {
        res.status(200).send("OK");
    });

    // readiness probe for knowing if service and its dependents are
    // ready to go
    router.get("/ready", function (req, res) {
        const probeItem: ProbeDataItem = probeDB[key];
        res.status(probeItem.state.ready ? 200 : 500).json({
            ready: probeItem.state.ready,
            since: probeItem.state.since,
            last: probeItem.state.last,
            details: probeItem.state.details,
            now: new Date().toISOString()
        });
    });

    // added this for diagnosing service state based on latency in kubernetes
    router.get("/readySync", async function (req, res) {
        const probeItem: ProbeDataItem = probeDB[key];
        await probeItem?.allProbesChecking?.();
        res.status(probeItem.state.ready ? 200 : 500).json({
            ready: probeItem.state.ready,
            since: probeItem.state.since,
            last: probeItem.state.last,
            details: probeItem.state.details,
            now: new Date().toISOString()
        });
    });

    return router;
}

function installUpdater(options: ConfigOption): ProbeDataItem {
    const { key } = options;
    if (!key) {
        throw new Error("key is required");
    }
    const hasNoProbeTasks =
        !options?.probes || Object.keys(options.probes).length === 0;

    probeDB[key] = {
        key,
        config: { probeUpdateMs: 10000, ...options },
        state: {
            ...getInitialState(),
            ready: hasNoProbeTasks ? true : false
        }
    };

    const allProbesCheckingTask = probeList2ProbeCheckingTask(
        options?.probes,
        key
    );
    const allProbesCheckingFunc = async () => {
        if (probeDB[key]?.allProbesChecking !== allProbesCheckingTask) {
            return;
        }
        await allProbesCheckingTask();
        // .unref() make sure the timer will not block the process from exiting
        setTimeout(
            allProbesCheckingFunc,
            probeDB[key].config.probeUpdateMs
        ).unref();
    };

    // should save allProbesCheckingTask rather than allProbesCheckingFunc
    // as allProbesCheckingFunc include the `setTimeout` logic
    probeDB[key].allProbesChecking = allProbesCheckingTask;

    // let's not bother running this inside test cases
    const isInTest = typeof it === "function";

    if (!hasNoProbeTasks) {
        if (!isInTest || options?.forceRun) {
            console.log("schedule ", key, "is checking");
            setTimeout(
                allProbesCheckingFunc,
                probeDB[key].config.probeUpdateMs
            ).unref();
        } else {
            // when the probe not run (e.g. in test cases) to make sure set it as true initially
            probeDB[key].state.ready = true;
        }
    }

    return probeDB[key];
}

export function installStatusRouter(
    app: Router,
    options: ConfigOption = {},
    routePrefix: string = ""
) {
    options.key = options?.key
        ? options?.key
        : callerPath() + routePrefix + "/status";
    installUpdater(options);
    const statusRouter = createStatusRouter(options.key);
    app.use(routePrefix + "/status", statusRouter);
}

export function createServiceProbe(
    url: string,
    statusLocation: string = "/status/ready"
): Probe {
    return async (): Promise<State> => {
        const data = await requestPromise("GET", `${url}${statusLocation}`);
        return data;
    };
}

function requestPromise(method: string, url: string) {
    return new Promise<any>((resolve, reject) => {
        request(
            {
                method,
                uri: url,
                json: true
            },
            (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    if (
                        response.statusCode >= 200 &&
                        response.statusCode <= 299
                    ) {
                        resolve(body);
                    } else {
                        reject(
                            Object.assign(
                                { statusCode: response.statusCode },
                                body
                            )
                        );
                    }
                }
            }
        );
    });
}
