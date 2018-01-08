import { Measure } from "@magda/typescript-common/src/format/Measure";
import { Record } from "@magda/typescript-common/src/generated/registry/api";
import { SelectedFormats } from "../../../magda-typescript-common/src/format/formats";
import * as mimeTypes from "mime-types";
import { Formats } from "@magda/typescript-common/src/format/formats";

/*
* Tries to determine the format by downloading the downloadURL, and deciphering the MIME type
* TODO not unit tested
*/
class DownloadMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        const { downloadURL } = this.relatedDistribution.aspects[
            "dcat-distribution-strings"
        ];
        const rawMime: string = mimeTypes.lookup(downloadURL);

        const processedMime: string = rawMime.split(rawMime)[1];

        return {
            selectedFormats: [
                {
                    format: (<any>Formats)[processedMime],
                    correctConfidenceLevel: 100,
                    distribution: this.relatedDistribution
                }
            ]
        };
    }
}

/*
* Tries to determine the format by deciphering DCAT-DISTRIBUTION-STRING -> format
* TODO separate words in cases when they are separated by a & or space or etc.
*/
class DcatFormatMeasure extends Measure {
    public relatedDistribution: Record;

    private applyTransform(format: string, transformFormat: any) {
            const newFormat = transformFormat(format);
        return newFormat;
    }

    private empty(str: string) {
        return "";
    }

    private lowercase(str: string) {
        return str.toLowerCase();
    }

    private removePeriod(str: string) {
        if (str[0] === ".") {
            return str.slice(1);
        } else {
            return str;
        }
    }

    private identity(str: string) {
        return str;
    }

    getSelectedFormats(): SelectedFormats {

        const { format } = this.relatedDistribution.aspects[
            "dcat-distribution-strings"
        ];

        let processedFormat: string;

        const transforms = [
            this.identity, (str: string) => this.removePeriod(this.lowercase(str))
        ];

        for (const tf of transforms) {
            processedFormat = this.applyTransform(format, tf);
        }

        // hard coded rules for separating out multiple formats when provided
        let splitFormat: Array<string>;
        let finalFormat: string;

        splitFormat = processedFormat.split("/");
        if(splitFormat.length > 2) throw new Error("a MIME type has more than 1 slash: " + processedFormat);
        if(splitFormat.length > 1) finalFormat = splitFormat[2];

        return {
            selectedFormats: [
                {
                    format: (<any>Formats)[processedFormat],
                    correctConfidenceLevel: 100,
                    distribution: this.relatedDistribution
                }
            ]
        }
    }
}

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
* TODO not finished
*/
class DownloadExtensionMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        const { downloadURL } = this.relatedDistribution.aspects["dcat-distribution-strings"];

        const urlRegexes: Array<Array<string>> = [
            [".*\\.geojson$", "GeoJSON"],
            [".*?.*service=wms.*", "WMS"],
            [".*?.*service=wfs.*", "WFS"],
            [".*\\.(shp|shz|dbf)(\\.zip)?$", "SHP"],
            [".*\\.(pdf)(\\.zip)?$", "PDF"],
            [".*\\.(xls|xlsx)(\\.zip)?$", "Excel"],
            [".*\\.(json)(\\.zip)?$", "JSON"],
            [".*\\.(xml)(\\.zip)?$", "XML"],
            [".*\\.(tif)(\\.zip)?$", "TIFF"],
            [".*\\.(zip)$", "ZIP"],
            [".*\\.(html|xhtml|php|asp|aspx|jsp)(\\?.*)?", "HTML"]
        ];

        let formatFromURL: Array<string> = [];
        urlRegexes.forEach(function(regex) {
            if(downloadURL.matches(regex[0])) formatFromURL.push(regex[1]);
        });

    }

}
