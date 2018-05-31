FROM quay.io/pires/docker-elasticsearch-kubernetes:5.6.3

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup.sh /setup.sh
COPY component/wn_s.pl /elasticsearch/config/analysis/wn_s.pl
COPY component/synonyms.txt /elasticsearch/config/analysis/synonyms.txt
RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]