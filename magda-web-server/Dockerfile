FROM node:6
ADD component/setup.sh /setup.sh
RUN mkdir -p /usr/src/app
COPY . /usr/src/app
WORKDIR /usr/src/app/component
CMD ["/setup.sh"]
