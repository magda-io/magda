FROM node:6

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "../node_modules/terriajs-server/lib/app.js", "--config-file", "devserverconfig.json" ]
