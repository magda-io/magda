# swagger-codegen-cli.jar

This is a lightly customized build of [swagger-codegen](https://github.com/swagger-api/swagger-codegen).

To run, make sure the registry-api is running at http://localhost:6100 (or change the URL in `CkanConnector/package.json`) and then:

```
cd CkanConnector
npm run generateSwaggerApis
```

To build:

```
git checkout -b magda git@github.com:TerriaJS/swagger-codegen.git
cd swagger-codegen
mvn clean package
```

The built jar will be found at `modules/swagger-codegen-cli/target/swagger-codegen-cli.jar`.
