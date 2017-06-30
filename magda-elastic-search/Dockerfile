FROM quay.io/pires/docker-elasticsearch-kubernetes:5.4.0

VOLUME /snapshots
	
ENV REPO /snapshots

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup-snapshot-dir.sh /setup-snapshot-dir.sh

CMD ["/setup-snapshot-dir.sh"]