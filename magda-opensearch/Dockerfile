FROM opensearchproject/opensearch:2.14.0
RUN /usr/share/opensearch/bin/opensearch-plugin remove opensearch-security

#COPY --chown=opensearch:opensearch component/opensearch.yml /usr/share/opensearch/config/
COPY --chown=opensearch:opensearch component/wn_s.pl /usr/share/opensearch/config/analysis/
COPY --chown=opensearch:opensearch component/regionSynonyms.txt /usr/share/opensearch/config/analysis/
#RUN apk add --no-cache --update curl procps
