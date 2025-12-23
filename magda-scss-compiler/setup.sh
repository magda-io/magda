#!/bin/bash
cd /usr/src/app

echo "Removing unnecessary files..."
cd /usr/src/app/component
node ./dist/cleanUpFiles.js
