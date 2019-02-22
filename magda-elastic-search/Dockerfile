FROM docker.elastic.co/elasticsearch/elasticsearch:6.5.4

ADD component/elasticsearch.yml /elasticsearch/config/elasticsearch.yml
ADD component/setup.sh /setup.sh
COPY component/wn_s.pl /elasticsearch/config/analysis/wn_s.pl
COPY component/regionSynonyms.txt /elasticsearch/config/analysis/regionSynonyms.txt
RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]
