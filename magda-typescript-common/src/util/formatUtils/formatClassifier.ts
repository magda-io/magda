/*
* sorts records by the format its in
* originally written by crisp
* modified by tristochief
* INPUT list of Record[] to sort
* RETURNS: Object, format, then list of Record[] that contains this format
*/

// import * as Baby from 'babyparse';

let fs = require("fs");
//import { Record } from "@magda/magda-typescript-common/dist/generated/registry/api";
import { Record } from "../../../dist/generated/registry/api";
import { promisify } from "util";

export function sortRecordsByFormat(records: Record[]) {
    let formats: any = {};

    let forEach = promisify(records.forEach);

    let p = forEach(record => {
        const { downloadURL, format } = record.aspects[
            "dcat-distribution-strings"
        ];
        formats[format] = (formats[format] || 0) + 1;
    }).then(() => {
        fs.writeFileSync("formats.json", JSON.stringify(formats, null, 2));
    });

    const formatsJson = require("../formats.json");

    function applyTransform(formats: any, transformFormat: any) {
        const newFormats: any = {};
        for (const key of Object.keys(formats)) {
            const newKey = transformFormat(key);
            newFormats[newKey] = (newFormats[newKey] || 0) + formats[key];
        }
        return newFormats;
    }

    function empty(str: string) {
        return "";
    }

    function lowercase(str: string) {
        return str.toLowerCase();
    }

    function removePeriod(str: string) {
        if (str[0] === ".") {
            return str.slice(1);
        } else {
            return str;
        }
    }

    function identity(str: string) {
        return str;
    }

    const transforms = [
        identity,
        /*lowercase, removePeriod,*/ (str: string) =>
            removePeriod(lowercase(str))
    ];
    for (const tf of transforms) {
        const finalFormats = applyTransform(formatsJson, tf);
        console.log(`Number of keys: ${Object.keys(finalFormats).length}`);
        console.log(JSON.stringify(finalFormats, null, 4));
    }
}

export interface FormatSortedRecords {
    format: string;
    records: Record[];
}
