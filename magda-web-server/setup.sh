#!/bin/bash
cd /usr/src/app
echo "Rebuild node-sass"
npm install node-sass@4.9.3 stringstream@1.0.0
echo "Rebuild node-sass done!"
echo "Re-cook the pancake"
#Symbol link doesn't work
cp -R node_modules/@magda/web-client ./web-client
./node_modules/@gov.au/pancake/bin/pancake ./web-client
# Copy back to node_modules/@magda/web-client. Therefore, the same porgram can run correctly both in / out docker
# Will make local test easier
cp -R ./web-client/src/pancake node_modules/@magda/web-client/src/pancake
echo "Pancake re-cooked~"
/usr/bin/env node /usr/src/app/component/dist/index.js