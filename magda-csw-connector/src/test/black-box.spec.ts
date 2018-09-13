"use strict";

import { runConnectorTest } from "@magda/typescript-common/dist/test/connectors/runConnectorTest";
import { MockCSWCatalog } from "./MockCSWCatalog";

const fs = require("fs");
const path = require("path");

const TEST_CASES = [
    {
        input: fs.readFileSync(path.join(__dirname, "csw1.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csw1.json")))
    }
];

runConnectorTest(TEST_CASES, MockCSWCatalog, {
    cleanRegistry: function(registry: any) {
        Object.values(registry.records).forEach(record => {
            if (record.aspects && record.aspects["csw-dataset"]) {
                delete record.aspects["csw-dataset"].xml;
            }
        });
    }
});
