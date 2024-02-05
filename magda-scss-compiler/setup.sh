#!/bin/bash
cd /usr/src/app
# only use cache repo for arm64
ARCH=`node -e "process.arch" -p`
if [ $ARCH == "arm64" ]; then
  export SASS_BINARY_SITE=https://raw.githubusercontent.com/magda-io/node-sass-cache/main
fi
echo "Rebuild node-sass"
npm rebuild node-sass
echo "Rebuild node-sass done!"

echo "Removing unnecessary files..."
cd /usr/src/app/component
node ./dist/cleanUpFiles.js
