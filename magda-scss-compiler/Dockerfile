FROM node:14 AS build
ADD component/setup.sh /setup.sh
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
RUN ["/setup.sh"]

FROM node:14-alpine
RUN mkdir -p /usr/src/app
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "/usr/src/app/component/dist/index.js" ]