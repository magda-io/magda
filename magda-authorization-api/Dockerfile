FROM node:18-alpine AS build

RUN mkdir -p /usr/src/app
COPY . /usr/src/app

# Reinstall bcrypt to pull correct binary for linux
RUN rm -Rf /usr/src/app/node_modules/bcrypt/lib && cd /usr/src/app/node_modules/bcrypt && /usr/src/app/node_modules/@mapbox/node-pre-gyp/bin/node-pre-gyp reinstall --update-binary --fallback-to-build

FROM node:18-alpine
RUN mkdir -p /usr/src/app
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "/usr/src/app/component/dist/index.js" ]