FROM quay.io/pires/docker-elasticsearch-kubernetes:5.6.3

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup.sh /setup.sh
RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]