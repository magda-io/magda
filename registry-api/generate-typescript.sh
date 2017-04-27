#!/bin/sh

CURRENT_DIR=$(pwd)
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CODEGEN_JAR=~/.ivy2/cache/io.swagger/swagger-codegen-cli/jars/

cd $DIR/../
sbt "registryApi/runMain au.csiro.data61.magda.registry.CommandLine $DIR/generated/swagger.json"
rm -rf generated/typescript
java -jar $CODEGEN_JAR/swagger-codegen-cli-2.2.2.jar generate -l typescript-node -i $DIR/generated/swagger.json -o $DIR/generated/typescript --type-mappings Aspect=any,JsonPatch=any --import-mappings Aspect=none,JsonPatch=none,Operation=none -DsupportsES6=true\"
cd $CURRENT_DIR