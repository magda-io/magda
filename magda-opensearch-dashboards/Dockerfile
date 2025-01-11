FROM opensearchproject/opensearch-dashboards:2.18.0
RUN /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin remove securityDashboards
COPY --chown=opensearch-dashboards:opensearch-dashboards component/opensearch_dashboards.yml /usr/share/opensearch-dashboards/config/