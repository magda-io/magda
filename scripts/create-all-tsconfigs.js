#!/usr/bin/env node
const fse = require('fs-extra');
const path = require('path');

const lernaJson = require('../lerna.json');

lernaJson.packages.forEach(function(packagePath) {
    const packageJson = require(path.resolve(packagePath, 'package.json'));
    const devDependencies = packageJson.devDependencies || {};
    const dependencies = packageJson.dependencies || {};

    // Is this a TypeScript package?  It must have a dependency on "typescript" and a "src" directory.
    const hasTypeScriptDependency = devDependencies.typescript !== undefined || dependencies.typescript !== undefined;
    const hasSrcDir = fse.existsSync(path.resolve(packagePath, 'src'));
    const isTypeScript = hasTypeScriptDependency && hasSrcDir;
    if (!isTypeScript) {
        return;
    }

    console.log(packageJson.name);

    const tsConfigBuild = {
        extends: '../tsconfig-global.json',
        compilerOptions: {
            declaration: true,
            outDir: 'dist',
            baseUrl: '.'
        },
        include: ['src']
    };

    fse.writeFileSync(path.resolve(packagePath, 'tsconfig-build.json'), JSON.stringify(tsConfigBuild, undefined, '    '));

    const paths = {};
    Object.keys(dependencies).filter(key => key.indexOf('@magda') === 0).forEach(function(key) {
        paths[key + '/dist/*'] = ['./node_modules/' +  key + '/src/*'];
    });

    const tsConfig = {
        extends: './tsconfig-build.json',
        compilerOptions: {
            baseUrl: '.',
            paths: paths
        }
    };

    fse.writeFileSync(path.resolve(packagePath, 'tsconfig.json'), JSON.stringify(tsConfig, undefined, '    '));
});
