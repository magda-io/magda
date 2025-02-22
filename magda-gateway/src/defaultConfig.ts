export default {
    proxyRoutes: {
        search: {
            to: "http://localhost:6102/v0",
            auth: true
        },
        "registry/hooks": {
            to: "http://localhost:6101/v0/hooks",
            auth: true
        },
        registry: {
            to: "http://localhost:6101/v0",
            auth: true,
            methods: [
                { method: "get", target: "http://localhost:6101/v0" },
                { method: "head", target: "http://localhost:6101/v0" },
                { method: "options", target: "http://localhost:6101/v0" },
                { method: "post", target: "http://localhost:6101/v0" },
                { method: "put", target: "http://localhost:6101/v0" },
                { method: "patch", target: "http://localhost:6101/v0" },
                { method: "delete", target: "http://localhost:6101/v0" }
            ]
        },
        "registry-read-only": {
            to: "http://localhost:6101/v0",
            auth: true
        },
        auth: {
            to: "http://localhost:6104/v0/public",
            auth: true
        },
        opa: {
            to: "http://localhost:6104/v0/opa",
            auth: true,
            statusCheck: false
        },
        admin: {
            to: "http://localhost:6112/v0",
            auth: true
        },
        apidocs: {
            to: "http://localhost:6118",
            redirectTrailingSlash: true
        },
        content: {
            to: "http://localhost:6119/v0",
            auth: true
        },
        storage: {
            to: "http://localhost:6121/v0",
            auth: true
        },
        "indexer/reindex": {
            to: "http://localhost:6103/v0/reindex",
            auth: true
        },
        "indexer/dataset": {
            to: "http://localhost:6103/v0/dataset",
            auth: true
        }
    },
    extraWebRoutes: {
        "preview-map": "http://localhost:6110"
    },
    cors: {}
};
