#!/usr/bin/env node
const fs = require('fs-extra');
const klawSync = require('klaw-sync');
const path = require('path');
const yargs = require('yargs');

const argv = yargs
    .config()
    .help()
    .option('in', {
        describe: 'The directory containing the connector configuration JSON files.',
        type: 'string',
        demandOption: true
    })
    .option('out', {
        describe: 'The directory in which to write the generated Kubernetes config files.',
        type: 'string',
        demandOption: true
    })
    .option('local', {
        describe: 'true to generate config files for a Minikube deployment with the registry on localhost:5000 and the version at latest.  Otherwise, the default registry and the version in the connector\'s package.json are used.',
        type: 'boolean',
        default: false
    })
    .argv;

fs.ensureDirSync(argv.out);

const files = klawSync(argv.in, { nodir: true });
files.forEach(function(connectorConfigFile) {
    const configFile = JSON.parse(fs.readFileSync(connectorConfigFile.path, 'utf8'));
    const connectorPackageName = configFile.type;
    const connectorPackagePath = path.join('..', connectorPackageName);
    const connectorPackageJson = JSON.parse(fs.readFileSync(path.join(connectorPackagePath, 'package.json'), 'utf8'));

    const imagePrefix = argv.local ? 'localhost:5000/data61/' : 'data61/';
    const imageVersion = argv.local ? 'latest' : connectorPackageJson.version;
    const image = imagePrefix + configFile.type + ':' + imageVersion;

    const basename = path.basename(connectorConfigFile.path, '.json');

    const jobSpec = {
        template: {
            metadata: {
                name: 'connector-' + basename
            },
            spec: {
                containers: [
                    {
                        name: 'connector-' + basename,
                        image: image,
                        command: [
                            'node', '/usr/src/app/component/dist/index.js',
                            '--config', "/etc/config/connector.json",
                            "--registryUrl", "http://registry-api/v0"
                        ],
                        imagePullPolicy: 'Always',
                        resources: {
                            requests: {
                                cpu: '100m'
                            }
                        },
                        volumeMounts: [
                            {
                                mountPath: '/etc/config',
                                name: 'config'
                            }
                        ]
                    }
                ],
                restartPolicy: 'OnFailure',
                volumes: [
                    {
                        name: 'config',
                        configMap: {
                            name: 'connector-config',
                            items: [
                                {
                                    key: path.basename(connectorConfigFile.path),
                                    path: 'connector.json'
                                }
                            ]
                        }
                    }
                ]
            },
        }
    };

    const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: 'connector-' + basename
        },
        spec: jobSpec
    };

    fs.writeFileSync(path.join(argv.out, 'connector-' + basename + '.json'), JSON.stringify(job, undefined, '  '), 'utf8');

    // const cron = {
    //     apiVersion: 'batch/v2alpha1',
    //     kind: 'CronJob',
    //     metadata: {
    //         name: 'connector-' + basename
    //     },
    //     spec: {
    //         schedule: configFile.schedule || '* * */3 * *',
    //         jobTemplate: {
    //             spec: jobSpec
    //         }
    //     }
    // };

    // fs.writeFileSync(path.join(argv.out, 'connector-' + basename + '-cron.json'), JSON.stringify(cron, undefined, '  '), 'utf8');
});
