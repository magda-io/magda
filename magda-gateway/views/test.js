var express = require("express");
var app = express();
var httpProxy = require("http-proxy");
var proxy = httpProxy.createProxyServer({}); // See (†)

app.set("views", __dirname);
app.set("view engine", "ejs");

app.use((req, res, next) => {
    res.set(
        "Content-Security-Policy",
        "sandbox allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
    );
    next();
});

app.all("/api/*", (req, res) => {
    proxy.web(req, res, {
        target: "https://issue-1653-2.dev.magda.io",
        changeOrigin: true
    });
});

app.get("/:page", function(req, res) {
    res.render(req.params.page);
});

app.listen(8080, function() {
    console.log("Example app listening on port 3000!");
});
