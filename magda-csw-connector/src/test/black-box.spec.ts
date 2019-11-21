"use strict";

import { runConnectorTest } from "@magda/typescript-common/dist/test/connectors/runConnectorTest";
import { MockCSWCatalog } from "./MockCSWCatalog";

const fs = require("fs");
const path = require("path");

const TEST_CASES = [
    /* basic CSW test file */
    {
        input: fs.readFileSync(path.join(__dirname, "aurin-response.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "aurin.json")))
    },
    /* basic CSW test file */
    {
        input: fs.readFileSync(path.join(__dirname, "csw1.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csw1.json")))
    },
    /**
     * Test for CSW data source: Geoscience Australia
     * All datasets should have at leaset one distributions
     */
    {
        input: fs.readFileSync(path.join(__dirname, "ga.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "ga.json")))
    },
    /**
     * Test for CSW data source: TERN
     * All datasets should have at leaset one distributions
     */
    {
        input: fs.readFileSync(path.join(__dirname, "tern.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "tern.json")))
    },
    /**
     * Test for CSW data source: Department of the Environment and Energy
     * The no.6, 7 & 9 datasets have zero distributions due to access control (nil in xml)
     * Except the three above, all other datasets have at leaset one distributions
     */
    {
        input: fs.readFileSync(path.join(__dirname, "env.xml")),
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "env.json")))
    }
];

runConnectorTest(TEST_CASES, MockCSWCatalog, {
    cleanRegistry: function(registry: any) {
        Object.values(registry.records).forEach((record: any) => {
            if (record.aspects && record.aspects["csw-dataset"]) {
                delete record.aspects["csw-dataset"].xml;
            }
        });
    }
});
