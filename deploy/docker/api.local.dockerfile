FROM hseeberger/scala-sbt

WORKDIR /usr/src/app

VOLUME /usr/src/app
VOLUME /root/.ivy2

ENV S3_SECRET_KEY=dummy

CMD sbt -DincludeMockData=true ~re-start