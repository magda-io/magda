#!/usr/bin/env node
const nodemon = require('nodemon');
const path = require('path');
const process = require('process');

const script = process.argv[2] || 'src/index.ts';
const cmd = [script].concat(process.argv.slice(3)).join(' ');
console.log(cmd);
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
