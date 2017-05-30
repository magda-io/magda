FROM nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY @magda/reverse-proxy/nginx.conf /etc/nginx
COPY @magda/reverse-proxy/cors.conf /etc/nginx