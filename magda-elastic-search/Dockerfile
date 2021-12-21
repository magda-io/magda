FROM docker.elastic.co/elasticsearch/elasticsearch:6.5.4

RUN yum -y install sudo zip

# Delete all x-pack modules
RUN find modules -type d -name "x-pack-*" -exec rm -r {} +

COPY --chown=elasticsearch:elasticsearch component/elasticsearch.yml /usr/share/elasticsearch/config/
RUN cd /usr/share/elasticsearch/lib && zip -q -d log4j-core-2.11.1.jar org/apache/logging/log4j/core/lookup/JndiLookup.class
ADD component/setup.sh /setup.sh
COPY --chown=elasticsearch:elasticsearch component/wn_s.pl /usr/share/elasticsearch/config/analysis/
COPY --chown=elasticsearch:elasticsearch component/regionSynonyms.txt /usr/share/elasticsearch/config/analysis/
#RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]