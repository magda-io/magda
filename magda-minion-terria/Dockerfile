FROM node:10

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "-r", "esm", "-r", "amd-loader", "/usr/src/app/component/dist/index.js", "--listenPort", "80" ]
