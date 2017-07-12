import * as config from 'config';
import * as express from 'express';
import * as path from 'path';
import * as URI from 'urijs';
import * as yargs from 'yargs';

const argv = yargs
    .config()
    .help()
    .option('disableAuthenticationFeatures', {
        describe: 'True to disable all features that require authentication.',
        type: 'boolean',
        default: false
    })
    .option('apiBaseUrl', {
        describe: 'The base URL of the MAGDA API Gateway.',
        type: 'string',
        default: 'http://localhost:6100/api/'
    })
    .option('searchApiBaseUrl', {
        describe: 'The base URL of the MAGDA Search API.  If not specified, the URL is built from the apiBaseUrl.',
        type: 'string'
    })
    .option('registryApiBaseUrl', {
        describe: 'The base URL of the MAGDA Registry API.  If not specified, the URL is built from the apiBaseUrl.',
        type: 'string'
    })
    .option('authApiBaseUrl', {
        describe: 'The base URL of the MAGDA Auth API.  If not specified, the URL is built from the apiBaseUrl.',
        type: 'string'
    })
    .option('discussionsApiBaseUrl', {
        describe: 'The base URL of the MAGDA Discussions API.  If not specified, the URL is built from the apiBaseUrl.',
        type: 'string'
    })
    .argv;

var app = express();

const clientRoot = path.join(__dirname, '..', 'node_modules', '@magda', 'web-client');
const clientBuild = path.join(clientRoot, 'build');
console.log(clientBuild);

app.get('/server-config.js', function(req, res) {
    const config = {
        disableAuthenticationFeatures: argv.disableAuthenticationFeatures,
        searchApiBaseUrl: argv.searchApiBaseUrl || new URI(argv.apiBaseUrl).segment('v0').segment('search').toString(),
        registryApiBaseUrl: argv.registryApiBaseUrl || new URI(argv.apiBaseUrl).segment('v0').segment('registry').toString(),
        authApiBaseUrl: argv.authApiBaseUrl || new URI(argv.apiBaseUrl).segment('v0').segment('auth').toString(),
        discussionsApiBaseUrl: argv.discussionsApiBaseUrl || new URI(argv.apiBaseUrl).segment('v0').segment('discussions').toString()
    };
    res.type('json');
    res.send('window.magda_server_config = ' + JSON.stringify(config) + ';');
});

app.use(express.static(clientBuild));

// URLs in this list will load index.html and be handled by React routing.
const topLevelRoutes = [
    'search',
    'feedback',
    'contact',
    'account',
    'sign-in-redirect',
    'dataset',
    'projects',
    'publishers'
];

topLevelRoutes.forEach(topLevelRoute => {
    app.get('/' + topLevelRoute, function(req, res) {
        res.sendFile(path.join(clientBuild, 'index.html'));
    });
    app.get('/' + topLevelRoute + '/*', function(req, res) {
        res.sendFile(path.join(clientBuild, 'index.html'));
    });
});

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
