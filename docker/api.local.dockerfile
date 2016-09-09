FROM hseeberger/scala-sbt

WORKDIR /usr/src/app

VOLUME /usr/src/app
VOLUME /root/.ivy2

CMD sbt ~re-start