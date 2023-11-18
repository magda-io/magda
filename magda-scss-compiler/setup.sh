#!/bin/bash
cd /usr/src/app
# only use cache repo for arm64
ARCH=`node -e "process.arch" -p`
if [ $ARCH == "arm64" ]; then
  export SASS_BINARY_SITE=https://raw.githubusercontent.com/magda-io/node-sass-cache/main
fi
# delete node-sass comes with pancake-sass 2.1.0 T_T
rm -Rf node_modules/@gov.au/pancake-sass/node_modules/node-sass
echo "Rebuild node-sass"
npm rebuild node-sass
echo "Rebuild node-sass done!"