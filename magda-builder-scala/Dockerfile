FROM ghcr.io/magda-io/magda-builder-docker:node22-ubuntu20

ARG TARGETOS
ARG TARGETARCH

# Default to UTF-8 file.encoding
ENV LANG=C.UTF-8
ENV SBT_VERSION=1.4.9
# make sure cache are captured completely
ENV SBT_OPTS="-Dsbt.global.base=/sbt-cache/sbtboot -Dsbt.boot.directory=/sbt-cache/boot -Dsbt.ivy.home=/sbt-cache/ivy"
ENV COURSIER_CACHE="/sbt-cache/coursier"
ENV SBT_HOME=/usr/local/sbt
ENV SCALA_VERSION=2.12.10

# Set JAVA_HOME and update PATH
ENV JAVA_HOME=/opt/java
ENV PATH=${PATH}:${JAVA_HOME}/jre/bin:${JAVA_HOME}/bin:${SBT_HOME}/bin

# Define OpenJDK version and base download URL
ENV OPEN_JDK_VERSION=8u452-b09
ENV OPEN_JDK_BUILD=OpenJDK8U-jdk
ENV OPEN_JDK_DIST=hotspot
ENV OPEN_JDK_BASE_URL=https://github.com/adoptium/temurin8-binaries/releases/download

# Install OpenJDK 8 from Adoptium (formerly AdoptOpenJDK) based on target arch
RUN set -eux; \
	OPEN_JDK_VERSION_FILE=$(echo "$OPEN_JDK_VERSION" | sed 's/-//g'); \
    if [ "$TARGETARCH" = "amd64" ]; then \
        JDK_ADOPTIUM_ARCH="x64"; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        JDK_ADOPTIUM_ARCH="aarch64"; \
    else \
        echo "Unsupported TARGETARCH: $TARGETARCH" && exit 1; \
    fi; \
    mkdir -p /opt/java; \
    curl -L -o /opt/java/openjdk8.tar.gz \
      "${OPEN_JDK_BASE_URL}/jdk${OPEN_JDK_VERSION}/${OPEN_JDK_BUILD}_${JDK_ADOPTIUM_ARCH}_linux_${OPEN_JDK_DIST}_${OPEN_JDK_VERSION_FILE}.tar.gz"; \
    tar -xzf /opt/java/openjdk8.tar.gz -C /opt/java --strip-components=1; \
    rm /opt/java/openjdk8.tar.gz

# Install sbt
RUN mkdir -p "$SBT_HOME" && \
    wget -qO -  "https://github.com/sbt/sbt/releases/download/v$SBT_VERSION/sbt-$SBT_VERSION.tgz" | tar xz -C $SBT_HOME --strip-components=1 && \
	# avoid run sbt from root directory due to https://github.com/sbt/sbt/issues/1458
	cd /home && \
	sbt sbtVersion
