FROM node:12
ADD component/setup.sh /setup.sh
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/component
RUN ["/setup.sh"]
ENTRYPOINT [ "node", "/usr/src/app/component/dist/index.js" ]
