import * as config from 'config';
import * as express from 'express';
import * as path from 'path';

var app = express();

const clientBuild = path.join(__dirname, '..', 'node_modules', '@magda', 'web-client', 'build');
console.log(clientBuild);
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
    app.get('/' + topLevelRoute, function (req, res) {
        res.sendFile(path.join(clientBuild, 'index.html'));
    });
    app.get('/' + topLevelRoute + '/*', function (req, res) {
        res.sendFile(path.join(clientBuild, 'index.html'));
    });
});

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
