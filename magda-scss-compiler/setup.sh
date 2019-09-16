#!/bin/bash
cd /usr/src/app
# delete node-sass comes with pancake-sass 2.1.0 T_T
# rm -Rf node_modules/@gov.au/pancake-sass/node_modules/node-sass
# echo "Rebuild node-sass"
# npm rebuild node-sass
# echo "Rebuild node-sass done!"
# echo "Re-cook the pancake"
#Symbol link doesn't work
# cp -R node_modules/@magda/web-client ./web-client
# rm -Rf ./web-client/src/pancake
# ./node_modules/@gov.au/pancake/bin/pancake ./web-client
cd ./node_modules/@magda/web-client
yarn
yarn run build
# Copy back to node_modules/@magda/web-client. Therefore, the same program can run correctly both in / out docker
# Will make local test easier
# rm -Rf ./node_modules/@magda/web-client/src/pancake
# cp -R ./web-client/src/pancake ./node_modules/@magda/web-client/src/pancake
echo "Pancake re-cooked~"