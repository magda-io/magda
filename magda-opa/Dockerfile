FROM alpine:3
COPY --from=openpolicyagent/opa:0.37.2-static /opa /opa
COPY component/start.sh /bin/start.sh
COPY component/policies /policies

ENTRYPOINT ["/bin/start.sh"]

CMD ["/opa", "run", "--ignore=.*", "-s", "/policies"]