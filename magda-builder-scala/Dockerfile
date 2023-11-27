FROM data61/magda-builder-docker:node18

RUN apk add --update --no-cache openjdk8

# Default to UTF-8 file.encoding
ENV LANG C.UTF-8
ENV JAVA_HOME /usr/lib/jvm/java-1.8-openjdk
ENV PATH $PATH:/usr/lib/jvm/java-1.8-openjdk/jre/bin:/usr/lib/jvm/java-1.8-openjdk/bin

ENV SBT_VERSION 1.4.9

# make sure cache are captured completely
ENV SBT_OPTS "-Dsbt.global.base=/sbt-cache/sbtboot -Dsbt.boot.directory=/sbt-cache/boot -Dsbt.ivy.home=/sbt-cache/ivy"
ENV COURSIER_CACHE "/sbt-cache/coursier"
ENV SBT_HOME /usr/local/sbt
ENV SCALA_VERSION 2.12.10
ENV PATH ${PATH}:${SBT_HOME}/bin

# Install sbt
RUN mkdir -p "$SBT_HOME" && \
    wget -qO -  "https://github.com/sbt/sbt/releases/download/v$SBT_VERSION/sbt-$SBT_VERSION.tgz" | tar xz -C $SBT_HOME --strip-components=1 && \
	# avoid run sbt from root directory due to https://github.com/sbt/sbt/issues/1458
	cd /home && \
	sbt sbtVersion

RUN echo "PATH=${PATH}:/usr/lib/jvm/java-1.8-openjdk/jre/bin:/usr/lib/jvm/java-1.8-openjdk/bin:/usr/local/sbt/bin" > /root/.profile