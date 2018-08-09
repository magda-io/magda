export default {
    proxyRoutes: {
        search: {
            to: "http://localhost:6102/v0"
        },
        registry: {
            to: "http://localhost:6101/v0",
            auth: true
        },
        auth: {
            to: "http://localhost:6104/v0/public",
            methods: ["GET"],
            auth: true
        },
        discussions: {
            to: "http://localhost:6105/v0",
            auth: true
        },
        web: {
            to: "http://localhost:6108"
        },
        "preview-map": {
            to: "http://localhost:6110"
        },
        admin: {
            to: "http://localhost:6112/v0",
            auth: true
        },
        feedback: {
            to: "http://localhost:6116/v0"
        },
        apidocs: {
            to: "http://localhost:6118"
        }
    },
    csp: {
        directives: {
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"]
        },
        browserSniff: false
    },
    helmet: {},
    cors: {}
};
