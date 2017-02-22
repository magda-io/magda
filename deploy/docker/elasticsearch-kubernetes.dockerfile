FROM quay.io/pires/docker-elasticsearch-kubernetes:5.2.0

VOLUME /snapshots

RUN echo http://nl.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories && \
	apk --no-cache add shadow && \
	adduser -D -g '' elasticsearch && \
	chown -R elasticsearch /snapshots && \
	usermod -u 1000 elasticsearch && \
	/elasticsearch/bin/elasticsearch-plugin install repository-s3
	
ENV REPO /snapshots

ADD elasticsearch.yml /elasticsearch/config/elasticsearch.yml