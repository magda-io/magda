FROM quay.io/pires/docker-elasticsearch-kubernetes:6.3.0

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup.sh /setup.sh
COPY component/wn_s.pl /elasticsearch/config/analysis/wn_s.pl
RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]
