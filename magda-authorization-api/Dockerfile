FROM node:10

RUN mkdir -p /usr/src/app
COPY . /usr/src/app
# Reinstall bcrypt to pull correct binary for linux
RUN rm -Rf /usr/src/app/node_modules/bcrypt/lib && cd /usr/src/app/node_modules/bcrypt && /usr/src/app/node_modules/node-pre-gyp/bin/node-pre-gyp install --update-binary --fallback-to-build
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "/usr/src/app/component/dist/index.js" ]