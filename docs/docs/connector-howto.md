#How to design and maintain connectors for external systems

Connectors are responsible for fetching metadata from external systems and converting their attributes
into those represented by "aspects" in the MAGDA system.

Most of the existing connectors are written in Javascript and are inherited from the [JSON Connector](https://github.com/magda-io/magda/blob/master/magda-typescript-common/src/JsonConnector.ts)
and [JSON Transformer](https://github.com/magda-io/magda/blob/master/magda-typescript-common/src/Transformer.ts) base implementations

If the system you are working with does not use JSON ie. XML, it typical to convert to a JSON representation first.

When developing a new connector, it is useful to save some samples of the source system and implement a [connector test](https://github.com/magda-io/magda/blob/master/magda-typescript-common/src/test/connectors/runConnectorTest.ts)
Each aspect-template can then be tested and debugged using the ["debugger;" javascript statement for inline/eval script debugging](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger).
