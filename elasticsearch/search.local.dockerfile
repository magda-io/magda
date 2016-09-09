FROM elasticsearch

ADD init-es.sh /init-es.sh

CMD ["/init-es.sh"]