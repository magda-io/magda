#!/usr/bin/env node
const nodemon = require('nodemon');
const path = require('path');
const process = require('process');

const script = process.argv[2];
if (!script) {
    console.error('The name of the script to execute is required.');
    process.exit(1);
}

nodemon({
    script: script,
    args: process.argv.slice(3),
    execMap: {
        ts: 'node ' + require.resolve('ts-node/dist/bin.js')
    }
});

nodemon.on('log', function(l) {
    console.log(l.colour);
});
