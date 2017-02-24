FROM quay.io/pires/docker-elasticsearch-kubernetes:5.2.0

VOLUME /snapshots

RUN /elasticsearch/bin/elasticsearch-plugin install repository-s3
	
ENV REPO /snapshots

ADD elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD setup-snapshot-dir.sh /setup-snapshot-dir.sh

CMD ["/setup-snapshot-dir.sh"]