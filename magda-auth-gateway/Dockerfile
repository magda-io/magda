FROM node:6

RUN npm update && \
  npm i -g typescript ts-node && \
  npm cache clean

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/@magda/auth-gateway

CMD [ "ts-node", "./index.ts" ]
