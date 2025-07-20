FROM alpine:3
COPY --from=openpolicyagent/opa:1.3.0-static /opa /opa
COPY component/start.sh /bin/start.sh
COPY component/policies /policies

ENTRYPOINT ["/bin/start.sh"]

CMD ["/opa", "run", "--ignore=.*", "-s", "/policies"]