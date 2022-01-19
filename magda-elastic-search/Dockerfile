FROM --platform=linux/amd64 docker.elastic.co/elasticsearch/elasticsearch:6.8.22 as stage-amd64
RUN yum -y install sudo zip
# Delete all x-pack modules
RUN find modules -type d -name "x-pack-*" -exec rm -r {} +
COPY --chown=elasticsearch:elasticsearch component/elasticsearch.yml /usr/share/elasticsearch/config/

FROM --platform=linux/arm64 data61/elasticsearch:6.8.22 as stage-arm64
RUN apt-get update && apt-get install -y --no-install-recommends sudo zip && rm -rf /var/lib/apt/lists/*
COPY --chown=elasticsearch:elasticsearch component/elasticsearch-arm64.yml /usr/share/elasticsearch/config/elasticsearch.yml

ARG TARGETARCH

FROM stage-${TARGETARCH} as final

ADD component/setup.sh /setup.sh
COPY --chown=elasticsearch:elasticsearch component/wn_s.pl /usr/share/elasticsearch/config/analysis/
COPY --chown=elasticsearch:elasticsearch component/regionSynonyms.txt /usr/share/elasticsearch/config/analysis/
#RUN apk add --no-cache --update curl procps
ENV REPO /snapshots

CMD ["/setup.sh"]