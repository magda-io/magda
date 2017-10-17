FROM quay.io/pires/docker-elasticsearch-kubernetes:5.6.3

VOLUME /snapshots
	
ENV REPO /snapshots

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup.sh /setup.sh

ENV ACCEPT_DEFAULT_PASSWORD false
ENV ELASTIC_PASSWORD elasticpassword
ENV KIBANA_PASSWORD kibanapassword
ENV XPACK_ENABLED true

RUN yes | /elasticsearch/bin/elasticsearch-plugin install --batch x-pack
RUN rm -rf /elasticsearch/plugins/x-pack/platform/linux-x86_64
RUN apk add --no-cache --update curl procps

CMD ["/setup.sh"]