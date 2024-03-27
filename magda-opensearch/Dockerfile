FROM opensearchproject/opensearch:2.12.0
RUN /usr/share/opensearch/bin/opensearch-plugin remove opensearch-security

#COPY --chown=elasticsearch:elasticsearch component/opensearch.yml /usr/share/opensearch/config/
COPY --chown=elasticsearch:elasticsearch component/wn_s.pl /usr/share/opensearch/config/analysis/
COPY --chown=elasticsearch:elasticsearch component/regionSynonyms.txt /usr/share/opensearch/config/analysis/
#RUN apk add --no-cache --update curl procps
