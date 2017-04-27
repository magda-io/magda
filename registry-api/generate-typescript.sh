#!/bin/sh

DIR=$(pwd)

cd ..
sbt "registryApi/runMain au.csiro.data61.magda.registry.CommandLine $DIR/generated/swagger.json"
cd $DIR
rm -rf generated/typescript
java -jar ../tools/swagger-codegen-cli.jar generate -l typescript-node -i $DIR/generated/swagger.json -o $DIR/generated/typescript --type-mappings Aspect=any,JsonPatch=any --import-mappings Aspect=none,JsonPatch=none,Operation=none -DsupportsES6=true\"