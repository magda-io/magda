FROM quay.io/pires/docker-elasticsearch-kubernetes:2.4.1

VOLUME /snapshots

RUN echo http://nl.alpinelinux.org/alpine/edge/community >> /etc/apk/repositories && \
	apk --no-cache add shadow && \
	adduser -D -g '' elasticsearch && \
	chown -R elasticsearch /snapshots && \
	usermod -u 1000 elasticsearch && \
	/elasticsearch/bin/plugin install cloud-aws
	
ENV REPO /snapshots

ADD elasticsearch.yml /elasticsearch/config/elasticsearch.yml