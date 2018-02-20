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
        type: "string",
        demand: true
    })
    .option("accessToken", {
        describe: "The access token to use to interact with the GitHub API.",
        type: "string",
        demand: true
    }).argv;

const parsedCreateIssueUrl = url.parse(argv.issuesUrl, true);
parsedCreateIssueUrl.query.access_token = argv.accessToken;
const createIssueUrl = url.format(parsedCreateIssueUrl);

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

app.post('/', function(req, res, next) {
    var parameters = req.body;

    request({
        url: createIssueUrl,
        method: 'POST',
        headers: {
            'User-Agent': argv.userAgent,
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            title: parameters.title ? parameters.title : 'User Feedback',
            body: formatBody(req, parameters)
        })
    }, function(error, response, body) {
        res.set('Content-Type', 'application/json');
        if (response.statusCode < 200 || response.statusCode >= 300) {
            res.status(response.statusCode).send(JSON.stringify({result: 'FAILED'}));
        } else {
            res.status(200).send(JSON.stringify({result: 'SUCCESS'}));
        }
    });

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
