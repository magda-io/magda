import * as express from "express";
import * as request from "request";
import * as url from "url";
import * as yargs from "yargs";

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
        describe: "The GitHub issues URL in which to create feedback issues, such as https://api.github.com/repos/TerriaJS/Magda-Feedback/issues",
        type: "string"
    })
    .option("trustProxy", {
        describe: "The value of the NodeJS 'trustProxy' variable, described at https://expressjs.com/en/guide/behind-proxies.html.",
        type: "string",
        default: "loopback, linklocal, uniquelocal"
    })
    .option("accessToken", {
        describe: "The access token to use to interact with the GitHub API. This can also be specified using the GITHUB_ACCESS_TOKEN environment variable.",
        type: "string"
    }).argv;

const accessToken = argv.accessToken || process.env.GITHUB_ACCESS_TOKEN;
const postToGitHub = accessToken && accessToken.length > 0 && argv.issuesUrl && argv.issuesUrl.length > 0;

let gitHubPostUrl = "";
if (postToGitHub) {
    const parsedCreateIssueUrl = url.parse(argv.issuesUrl, true);
    parsedCreateIssueUrl.query.access_token = accessToken;
    gitHubPostUrl = url.format(parsedCreateIssueUrl);
} else {
    console.warn('GitHub issuesUrl and accessToken were not supplied, feedback will only be printed to the console.');
}

// Create a new Express application.
var app = express();
app.set('trust proxy', argv.trustProxy);
app.use(require("body-parser").json());

app.post('/v0', function(req, res, next) {
    var parameters = req.body;

    const body = JSON.stringify({
        title: parameters.title ? parameters.title : 'User Feedback',
        body: formatBody(req, parameters)
    });

    if (postToGitHub) {
        request({
            url: gitHubPostUrl,
            method: 'POST',
            headers: {
                'User-Agent': argv.userAgent,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: body
        }, function(error, response, body) {
            res.set('Content-Type', 'application/json');
            if (response.statusCode < 200 || response.statusCode >= 300) {
                res.status(response.statusCode).send(JSON.stringify({result: 'FAILED'}));
            } else {
                res.status(200).send(JSON.stringify({result: 'SUCCESS'}));
            }
        });
    } else {
        console.log(body);
        res.status(200).send(JSON.stringify({result: 'SUCCESS'}));
    }
});

app.listen(argv.listenPort);
console.log("Feedback API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});

function formatBody(request: any, parameters: any) {
    var result = '';

    result += parameters.comment ? parameters.comment : 'No comment provided';
    result += '\n### User details\n';
    result += '* Name: '          + (parameters.name ? parameters.name : 'Not provided') + '\n';
    result += '* Email Address: ' + (parameters.email ? parameters.email : 'Not provided') + '\n';
    result += '* IP Address: '    + request.ip + '\n';
    result += '* User Agent: '    + request.header('User-Agent') + '\n';
    result += '* Referrer: '      + request.header('Referrer') + '\n';
    result += '* Share URL: '     + (parameters.shareLink ? parameters.shareLink : 'Not provided') + '\n';

    return result;
}
