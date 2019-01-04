import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

const URL_REGEXES: Array<[RegExp, string]> = [
    [new RegExp(".*\\.geojson$", "i"), "GEOJSON"],
    [new RegExp(".*\\?.*service=wms.*", "i"), "WMS"],
    [new RegExp(".*\\?.*service=wfs.*", "i"), "WFS"],
    [new RegExp("\\W+MapServer\\W*|\\W+FeatureServer\\W*", "i"), "ESRI REST"],
    [new RegExp(".*\\.(shp|shz|dbf)(\\.zip)?$", "i"), "SHP"],
    [new RegExp(".*\\.(pdf)(\\.zip)?$", "i"), "PDF"],
    [new RegExp(".*\\.(json)(\\.zip)?$", "i"), "JSON"],
    [new RegExp(".*\\.(xml)(\\.zip)?$", "i"), "XML"],
    [new RegExp(".*\\.(doc)(\\.zip)?$", "i"), "DOC"],
    [new RegExp(".*\\.(docs)(\\.zip)?$", "i"), "DOCS"],
    [new RegExp(".*\\.(xlsx)(\\.zip)?$", "i"), "XLSX"],
    [new RegExp(".*\\.(xls)(\\.zip)?$", "i"), "XLS"],
    [new RegExp(".*\\.(tif)(\\.zip)?$", "i"), "TIFF"],
    [new RegExp(".*\\.(zip)$", "i"), "ZIP"],
    [new RegExp(".*\\.(sav)$", "i"), "SPSS"],
    [new RegExp(".*\\.(html|xhtml|php|asp|aspx|jsp|htm)(\\?.*)?", "i"), "HTML"],
    [new RegExp(".*\\/$", "i"), "HTML"]
];

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
*/
export default function getMeasureResults(
    relatedDistribution: any,
    synonymObject: any
): MeasureResult {
    const dcatDistributionStrings =
        relatedDistribution.aspects["dcat-distribution-strings"];

    let { downloadURL } = dcatDistributionStrings;
    if (!downloadURL || downloadURL === "") {
        downloadURL = dcatDistributionStrings.accessURL;
        if (!downloadURL || downloadURL.trim() === "") return null;
    }

    const formatFromURL: [RegExp, string] = URL_REGEXES.find(
        ([regex]) => (downloadURL.match(regex) ? true : false)
    );

    if (formatFromURL) {
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
