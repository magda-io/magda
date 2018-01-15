import { Record } from "@magda/typescript-common/src/generated/registry/api";
import { Formats } from "@magda/typescript-common/src/format/formats";
import MeasureResult from "src/format-engine/measures/MeasureResult";

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
* TODO not finished
*/
export default function getMeasureResuls(
    relatedDistribution: Record
): MeasureResult {
    const { downloadURL } = relatedDistribution.aspects[
        "dcat-distribution-strings"
    ];

    if (downloadURL === null || downloadURL === "") {
        return null;
    }

    let downloadURLStringify: string = downloadURL;

    //NOTE regexes do not allow more than 1 regex to match 1 url + break in forEach loop does this too
    // but this Measure has been programmed to make it easily extensible to allowing multiple formats
    // to be deduced by 1 url
    const urlRegexes: Array<Array<string>> = [
        [".*\\.geojson$", "GEOJSON"],
        [".*?.*service=wms.*", "WMS"],
        [".*?.*service=wfs.*", "WFS"],
        [".*\\.(shp|shz|dbf)(\\.zip)?$", "SHP"],
        [".*\\.(pdf)(\\.zip)?$", "PDF"],
        [".*\\.(json)(\\.zip)?$", "JSON"],
        [".*\\.(xml)(\\.zip)?$", "XML"],
        [".*\\.(doc)(\\.zip)?$", "DOC"],
        [".*\\.(docs)(\\.zip)?$", "DOCS"],
        [".*\\.(xlsx)(\\.zip)?$", "XLSX"],
        [".*\\.(xls)(\\.zip)?$", "XLS"],
        [".*\\.(tif)(\\.zip)?$", "TIFF"],
        [".*\\.(zip)$", "ZIP"],
        [".*\\.(html|xhtml|php|asp|aspx|jsp|htm)(\\?.*)?", "HTML"]
    ];

    let formatsFromURL: Array<string> = [];
    urlRegexes.some(function(regex) {
        if (downloadURLStringify.match(regex[0])) {
            formatsFromURL.push(regex[1]);
            return true; // means 'break'
        }

        return false; // means 'continue'
    });

    return {
        formats: formatsFromURL.map(eachFormat => {
            return {
                format: (<any>Formats)[eachFormat] || Formats.OTHER,
                correctConfidenceLevel: 100,
            };
        }),
        distribution: relatedDistribution
    };
}
