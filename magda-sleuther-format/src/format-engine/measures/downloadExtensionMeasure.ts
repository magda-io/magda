import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
*/
export default function getMeasureResults(
    relatedDistribution: any,
    synonymObject: any
): MeasureResult {
    let { downloadURL } = relatedDistribution.aspects[
        "dcat-distribution-strings"
    ];

    if (!downloadURL || downloadURL === "") {
        downloadURL =
            relatedDistribution.aspects["dcat-distribution-strings"][
                "accessURL"
            ];
        if (!downloadURL || downloadURL === "") return null;
    }

    let downloadURLString: string = downloadURL;

    const urlRegexes: Array<Array<string>> = [
        [".*\\.geojson$", "GEOJSON"],
        [".*?.*service=wms.*", "WMS"],
        [".*?.*service=wfs.*", "WFS"],
        ["\\W+MapServer\\W*|\\W+FeatureServer\\W*", "ESRI REST"],
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
        [".*\\.(html|xhtml|php|asp|aspx|jsp|htm)(\\?.*)?", "HTML"],
        [".*\\/$", "HTML"]
    ];

    let formatFromURL: Array<string> = urlRegexes.find(regexCombo => {
        return downloadURLString.match(new RegExp(regexCombo[0], "i"))
            ? true
            : false;
    });

    if (formatFromURL && formatFromURL.length > 0) {
        return {
            formats: [
                {
                    format: getCommonFormat(formatFromURL[1], synonymObject),
                    correctConfidenceLevel: 100
                }
            ],
            distribution: relatedDistribution
        };
    } else {
        return null;
    }
}
