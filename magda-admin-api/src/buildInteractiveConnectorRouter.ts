import "isomorphic-fetch";
import buildConnectorManifest from "./buildConnectorManifest";
import K8SApi from "./k8sApi";
import * as express from "express";
import * as HttpProxy from "http-proxy";

// Use type merging to add a connectorProxy property to Express's Request object.
declare global {
    namespace Express {
        export interface Request {
            connectorProxy: HttpProxy,
            connectorID: string
        }
    }
}

export interface Options {
    dockerRepo: string;
    authApiUrl: string;
    imageTag: string;
    registryApiUrl: string;
    pullPolicy: string;
    k8sApi: K8SApi;
}

export default function buildInteractiveConnectorRouter(options: Options) {
    const k8sApi = options.k8sApi;

    const router: express.Router = express.Router();

    router.use(function(req, res, next) {
        ensureInteractiveConnector(k8sApi, req.connectorID, options)
            .then(function(connectorProxy) {
                req.connectorProxy = connectorProxy;
                next();
            })
            .catch(function(e) {
                res.status(400);
                res.send("Could not connect to Connector.");
            });
    });

    router.get([
        "/test-harness.js",
        "/dataset",
        "/distribution",
        "/organization"
    ], (req, res) => {
        req.connectorProxy.web(req, res);
    });

    return router;
}

const prefixId = (id: string) => `connector-interactive-${id}`;

async function createInteractiveJob(k8sApi: K8SApi, id: any, options: Options): Promise<any> {
    await k8sApi.deleteJobIfPresent(prefixId(id));

    const configMap = await k8sApi.getConnectorConfigMap();
    if (!configMap[id]) {
        throw new Error("No config for connector ID: " + id);
    }

    return k8sApi.createJob(buildConnectorManifest({
        id,
        dockerImage: configMap[id].type,
        dockerImageTag: options.imageTag,
        dockerRepo: options.dockerRepo,
        registryApiUrl: options.registryApiUrl,
        pullPolicy: options.pullPolicy,
        interactive: true
    }));
}

async function ensureInteractiveConnector(k8sApi: K8SApi, id: any, options: Options, retries?: number): Promise<HttpProxy> {
    let job = await k8sApi.getJob(prefixId(id)).catch(e => undefined);

    if (job === undefined || job.status === undefined || job.status.active === 0) {
        job = await createInteractiveJob(k8sApi, id, options);
        if (job === undefined) {
            throw new Error("Could not create interactive connector: " + id);
        }
    }

    let connectorUrl: string;
    if (k8sApi.apiType === "minikube") {
        // The Admin API is running outside the cluster.
        // We need a Service with a nodePort in order to be able to call into the connector
        // running inside the cluster.

        let service = await k8sApi.getService(prefixId(id)).catch(e => undefined);
        if (service === undefined) {
            // Service does not exist, create it.

            // We're letting k8s assign a nodePort automatically, since we
            // don't care what it is.  The risk is that it will pick a port that
            // we've explicitly allocated to other pods, those pods will not have started
            // yet when this code runs, and later when they do start they will fail
            // because this service is already bound to their port.  This seems
            // like a fairly remote possibility, and it will only happen in development
            // (never in anything resembling a real deployment), so ¯\_(ツ)_/¯.
            service = await k8sApi.createService({
                apiVersion: 'v1',
                kind: 'Service',
                metadata: {
                    name: prefixId(id)
                },
                spec: {
                    ports: [
                        {
                            name: 'http',
                            port: 80,
                            targetPort: 80
                        }
                    ],
                    type: 'NodePort',
                    selector: job.spec.selector.matchLabels
                }
            });
        }

        connectorUrl = `http://${k8sApi.minikubeIP}:${service.spec.ports[0].nodePort}/v0`;
    } else {
        // The Admin API is running inside the cluster.
        // We just need the IP address of the pod and we can talk to it directly.
        const pods = await k8sApi.getPodsWithSelector(job.spec.selector.matchLabels);
        const podsWithIP = pods.items.filter((pod: any) => pod.status && pod.status.podIP);
        if (podsWithIP.length === 0) {
            console.log('no pods have an IP');
            // TODO: Maybe we need to wait for it to start up?  Or it already shut down
            throw new Error("TODO");
        }

        const ip = podsWithIP[0].status.podIP;
        connectorUrl = `http://${ip}/v0`;
        console.log(connectorUrl);
    }

    // Access the interactive connector's /status service.
    // This does two things:
    // 1. It makes sure the interactive connector is running.
    // 2. It resets the timeout, guaranteeing that the connector won't shut itself down
    //    before our real request comes through (assuming that the timeout is much longer
    //    than any reasonable single request).
    const status = await fetch(connectorUrl + '/status');

    if (!status.ok) {
        // The job exists and appears to be running, but it's not responding correctly.
        // The most likely cause is that it just timed out and shut down.  Let's restart
        // it and try again.  Unless we've already tried that.
        if (retries !== undefined && retries > 0) {
            throw new Error("Could not create a working interactive connector: " + id);
        }
        await k8sApi.deleteJobIfPresent(prefixId(id));
        return ensureInteractiveConnector(k8sApi, id, options, 1);
    }

    const proxy = HttpProxy.createProxyServer({
        target: connectorUrl
    });

    return proxy;
}
