#!/usr/bin/env node
const childProcess = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const process = require('process');
const yargs = require('yargs');

const argv = yargs.options({
    include: {
        description: 'The files and directories to include in the Docker image.  If not specified, uses the space-separated list in the `npm_package_config_docker_include` environment variable.',
        default: (process.env.npm_package_config_docker_include || '').split(' '),
        type: 'array'
    },
    build: {
        description: 'Pipe the Docker context straight to Docker.',
        type: 'boolean',
        default: false
    },
    tag: {
        description: 'The tag to pass to "docker build".  This parameter is only used if --build is specified.  If the value of this parameter is `auto`, a tag name is automatically created from NPM configuration.',
        type: 'string'
    },
    output: {
        description: 'The output path and filename for the Docker context .tar file.',
        type: 'string'
    },
    local: {
        description: 'Build for a local Kubernetes container registry.  This parameter is only used if --build is specified.',
        type: 'boolean',
        default: false
    },
    push: {
        description: 'Push the build image to the docker registry.  This parameter is only used if --build is specified.',
        type: 'boolean',
        default: false
    }
}).help().argv;

if (!argv.build && !argv.output) {
    console.log('Either --build or --output <filename> must be specified.');
    process.exit(1);
}

const componentSrcDir = path.resolve(process.cwd())
const dockerContextDir = fse.mkdtempSync(path.resolve(__dirname, '..', 'docker-context-'));
const componentDestDir = path.resolve(dockerContextDir, 'component');

fse.emptyDirSync(dockerContextDir);
fse.ensureDirSync(componentDestDir);
fse.ensureSymlinkSync(path.resolve(componentSrcDir, '..', 'node_modules'), path.resolve(dockerContextDir, 'node_modules'), 'junction');

const linksToCreate = argv.include.filter((value, index, self) => self.indexOf(value) === index);
linksToCreate.forEach(link => {
    const src = path.resolve(componentSrcDir, link);
    const dest = path.resolve(componentDestDir, link);
    const type = fse.statSync(src).isFile() ? 'file' : 'junction'

    // On Windows we can't create symlinks to files without special permissions.
    // So just copy the file instead.  Usually creating directory junctions is
    // fine without special permissions, but fall back on copying in the unlikely
    // event that fails, too.
    try {
        fse.ensureSymlinkSync(src, dest, type);
    } catch(e) {
        fse.copySync(src, dest);
    }
});

const tar = process.platform === 'darwin' ? 'gtar' : 'tar';

if (argv.build) {
    // Docker and ConEmu (an otherwise excellent console for Windows) don't get along.
    // See: https://github.com/Maximus5/ConEmu/issues/958 and https://github.com/moby/moby/issues/28814
    // So if we're running under ConEmu, we need to add an extra -cur_console:i parameter to disable
    // ConEmu's hooks and also set ConEmuANSI to OFF so Docker doesn't do anything drastic.
    const env = Object.assign({}, process.env);
    const extraParameters = [];
    if (env.ConEmuANSI === 'ON') {
        env.ConEmuANSI = 'OFF';
        extraParameters.push('-cur_console:i');
    }

    const tarProcess = childProcess.spawn(tar, [...extraParameters, '--dereference', '-cf', '-', '*'], {
        cwd: dockerContextDir,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: env,
        shell: true
    });

    let tag = argv.tag;
    if (tag === 'auto') {
        const tagPrefix = argv.local ? 'localhost:5000/' : '';
        const version = !argv.local && process.env.npm_package_version ? process.env.npm_package_version : 'latest';
        const name = process.env.npm_package_config_docker_name
            ? process.env.npm_package_config_docker_name
            : (process.env.npm_package_name ? process.env.npm_package_name : 'UnnamedImage');
        tag = tagPrefix + name + ':' + version;
    }
    const tagArgs = tag ? ['-t', tag] : [];

    const dockerProcess = childProcess.spawn(
        'docker',
        [...extraParameters, 'build', ...tagArgs, '-f', `./component/Dockerfile`, '-'], {
        stdio: ['pipe', 'inherit', 'inherit'],
        env: env
    });

    dockerProcess.on('close', code => {
        fse.removeSync(dockerContextDir);

        if (code === 0 && argv.push) {
            if (!tag) {
                console.error('Can not push an image without a tag.');
                process.exit(1);
            }
            childProcess.spawnSync('docker', ['push', tag], {
                stdio: 'inherit'
            });
        }
        process.exit(code);
    });

    tarProcess.on('close', code => {
        dockerProcess.stdin.end();
    });

    tarProcess.stdout.on('data', data => {
        dockerProcess.stdin.write(data);
    });
} else if (argv.output) {
    console.log(path.resolve(process.cwd(), argv.output));
    const tarProcess = childProcess.spawnSync(tar, ['--dereference', '-cf', argv.output, '*'], {
        stdio: 'inherit'
    });
    console.log(tarProcess.status);
    fse.removeSync(dockerContextDir);
}
