import * as yargs from "yargs";
import * as url from "url";
import buildFeedbackRouter from "./buildFeedbackRouter";

const argv = yargs
    .config()
    .help()
    .option("listenPort", {
        describe: "The TCP/IP port on which the feedback api should listen.",
        type: "number",
        default: 6116
    })
    .option("userAgent", {
        describe: "The user agent to use when contacting the GitHub API",
        type: "string",
        default: "Magda Feedback"
    })
    .option("issuesUrl", {
        describe:
            "The GitHub issues URL in which to create feedback issues, such as https://api.github.com/repos/TerriaJS/Magda-Feedback/issues",
        type: "string"
    })
    .option("trustProxy", {
        describe:
            "The value of the NodeJS 'trustProxy' variable, described at https://expressjs.com/en/guide/behind-proxies.html.",
        type: "string",
        default: "loopback, linklocal, uniquelocal"
    })
    .option("accessToken", {
        describe:
            "The access token to use to interact with the GitHub API. This can also be specified using the GITHUB_ACCESS_TOKEN environment variable.",
        type: "string"
    }).argv;

const accessToken = argv.accessToken || process.env.GITHUB_ACCESS_TOKEN;
const shouldPostToGithub =
    accessToken &&
    accessToken.length > 0 &&
    argv.issuesUrl &&
    argv.issuesUrl.length > 0;

let gitHubPostUrl = "";
if (shouldPostToGithub) {
    const parsedCreateIssueUrl = url.parse(argv.issuesUrl, true);
    parsedCreateIssueUrl.query.access_token = accessToken;
    gitHubPostUrl = url.format(parsedCreateIssueUrl);
} else {
    console.warn(
        "GitHub issuesUrl and accessToken were not supplied, feedback will only be printed to the console."
    );
}

const app = buildFeedbackRouter({
    trustProxy: argv.trustProxy,
    shouldPostToGithub,
    gitHubPostUrl,
    userAgent: argv.userAgent
});

app.get("/v0/healthz", function(req, res, next) {
    res.status(200).send("OK");
});

app.listen(argv.listenPort);

console.log("Feedback API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});
