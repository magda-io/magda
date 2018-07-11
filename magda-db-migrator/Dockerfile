FROM ubuntu

RUN apt-get update && apt-get install -y patch
RUN apt-get install --assume-yes postgresql-client
RUN mkdir -p /flyway/sql
COPY component/flyway-commandline-4.2.0-linux-x64.tar.gz /flyway
COPY component/migrate.sh /usr/local/bin/

CMD ["migrate.sh"]
