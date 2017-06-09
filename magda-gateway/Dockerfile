FROM node:8

RUN npm update && \
  npm i -g typescript ts-node

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/@magda/gateway

CMD [ "ts-node", "./index.ts" ]
