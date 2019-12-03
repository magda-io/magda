"use strict";

import { runConnectorTest } from "@magda/typescript-common/dist/test/connectors/runConnectorTest";
import { MockCSVCatalog } from "./MockCSVCatalog";

const fs = require("fs");
const path = require("path");

const TEST_CASES = [
    {
        input: {
            mime: "application/vnd.ms-excel",
            data: fs.readFileSync(path.join(__dirname, "csv1.xlsx"))
        },
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csv1.json")))
    },
    {
        input: {
            mime: "text/csv",
            data: fs.readFileSync(path.join(__dirname, "csv2.csv"))
        },
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csv2.json")))
    },
    {
        input: {
            mime: "application/vnd.ms-excel",
            data: fs.readFileSync(path.join(__dirname, "csv3.xlsx"))
        },
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csv3.json")))
    },
    {
        input: {
            mime: "text/csv",
            data: fs.readFileSync(path.join(__dirname, "csv4.csv"))
        },
        output: JSON.parse(fs.readFileSync(path.join(__dirname, "csv4.json")))
    }
];

runConnectorTest(TEST_CASES, MockCSVCatalog, {
    cleanRegistry: function(registry: any) {
        Object.values(registry.records).forEach((record: any) => {
            if (record.aspects && record.aspects["csv-dataset"]) {
                delete record.aspects["csv-dataset"].json;
            }
        });
    }
});
