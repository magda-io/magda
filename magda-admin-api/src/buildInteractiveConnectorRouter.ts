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

    router.get("/test-harness.js", (req, res) => {
        req.connectorProxy.web(req, res);
    });

    return router;
}

const prefixId = (id: string) => `connector-interactive-${id}`;

function ensureInteractiveConnector(k8sApi: K8SApi, id: any, options: Options): Promise<HttpProxy> {
    // Get its IP, send it a status request.  If it responds OK, use it!
    // Otherwise, restart the job and try again.

    // See if there is already a running interactive job.
    const jobPromise = k8sApi.getJob(prefixId(id)).catch(function(e) {
        // Job does not exist, we'll need to create it.
        return undefined;
    }).then(function(job) {
        if (job === undefined || job.status.active === 0) {
            // Job does not exist or is not running, so (re)create it.
            return k8sApi.deleteJobIfPresent(prefixId(id)).then(function() {
                return k8sApi.getConnectorConfigMap();
            }).then((configMap: any) => {
                if (!configMap[id]) {
                    throw new Error("No config for connector ID: " + id);
                } else {
                    return k8sApi.createJob(
                        buildConnectorManifest({
                            id,
                            dockerImage: configMap[id].type,
                            dockerImageTag: options.imageTag,
                            dockerRepo: options.dockerRepo,
                            registryApiUrl: options.registryApiUrl,
                            pullPolicy: options.pullPolicy,
                            interactive: true
                        }));
                }
            }).then(function() {
                return k8sApi.getJob(prefixId(id));
            });
        }
        return job;
    });

    if (k8sApi.apiType === 'minikube') {
        // The Admin API is running outside the cluster.
        // We need a Service with a nodePort in order to be able to call into the connector
        // running inside the cluster.

        return jobPromise.then(function(job) {
            return k8sApi.getService(prefixId(id)).catch(function(e) {
                // Service does not exist, create it.
                return k8sApi.createService({
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
                }).catch(function(e) {
                    console.log(e);
                }).then(function() {
                    return k8sApi.getService(prefixId(id));
                });
            });
        }).then(function(service) {
            const proxy = HttpProxy.createProxyServer({
                target: `http://${k8sApi.minikubeIP}:${service.spec.ports[0].nodePort}/v0`
            });
            return proxy;
        });
    } else {
        // The Admin API is running inside the cluster.
        // We just need the IP address of the pod and we can talk to it directly.

        // Find the associated pod.
        return jobPromise.then(function(job) {
            if (job === undefined || job.status === undefined || job.status.active === 0) {
                throw new Error("Failed to start interactive connector job with ID: " + id);
            }

            return k8sApi.getPodsWithSelector(job.spec.selector.matchLabels);
        }).then(function(pods) {
            // TODO: the pod might be ready yet if it was just started
            // TODO: what if the admin API is running outside the cluster?  Need a service with a nodePort?
            // pods.items.forEach(pod => {
            //     pod.status.podIP
            // });
            const proxy = HttpProxy.createProxyServer({
                target: 'https://putsreq.com/u2uluuEEWV0FflwqlO6k',
                secure: false
            });
            return proxy;
        });
    }
}
