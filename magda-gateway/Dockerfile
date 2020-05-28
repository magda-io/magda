FROM node:10
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
# Reinstall bcrypt to pull correct binary for linux (npm build won't help due to a node-gyp path issue)
RUN rm -Rf /usr/src/app/node_modules/bcrypt && cd /usr/src/app/component && npm install bcrypt
WORKDIR /usr/src/app/component
ENTRYPOINT [ "node", "/usr/src/app/component/dist/index.js" ]
