FROM opensearchproject/opensearch:3.0.0
RUN /usr/share/opensearch/bin/opensearch-plugin remove opensearch-security --purge
COPY --chown=opensearch:opensearch component/wn_s.pl /usr/share/opensearch/config/analysis/
COPY --chown=opensearch:opensearch component/regionSynonyms.txt /usr/share/opensearch/config/analysis/
