FROM openjdk:8-jre

RUN mkdir -p /flyway/sql
# jre will be removed in migrate.sh in order to use the jre matches current arch
COPY component/flyway-commandline-4.2.0-linux-x64.tar.gz /flyway
COPY component/migrate.sh /usr/local/bin/

CMD ["migrate.sh"]
