# Docker image for the primary national map application server
FROM node:5.11-onbuild
MAINTAINER briely.marum@nicta.com.au

RUN apt-get update && apt-get install -y gdal-bin

# Install app dependencies
RUN npm install -g gulp && npm install

# Bundle app source
RUN gulp

EXPOSE 3001
CMD [ "node", "node_modules/terriajs-server/lib/app.js", "--config-file", "devserverconfig.json" ]
