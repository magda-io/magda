FROM postgres:9.6

RUN mkdir -p /flyway/sql
RUN chown -R postgres /flyway
COPY component/flyway-commandline-4.2.0-linux-x64.tar.gz /flyway
COPY component/migrate-and-start.sh /usr/local/bin/

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["gosu", "postgres", "migrate-and-start.sh", "postgres"]
