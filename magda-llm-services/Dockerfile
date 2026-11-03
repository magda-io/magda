FROM node:22-alpine
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/component
USER 1000
ENTRYPOINT ["node", "/usr/src/app/component/dist/index.js"]
