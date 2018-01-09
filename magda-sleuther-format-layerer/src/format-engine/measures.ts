import { Measure } from "@magda/typescript-common/src/format/Measure";
import { Record } from "@magda/typescript-common/src/generated/registry/api";
import { SelectedFormats } from "../../../magda-typescript-common/src/format/formats";
import * as mimeTypes from "mime-types";
import { Formats } from "@magda/typescript-common/src/format/formats";

/*
* Tries to determine the format by downloading the downloadURL, and deciphering the MIME type
* TODO not unit tested
*/
export class DownloadMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        const { downloadURL } = this.relatedDistribution.aspects[
            "dcat-distribution-strings"
        ];
        const rawMime: string = mimeTypes.lookup(downloadURL);

        const processedMime: string = rawMime.split(rawMime)[1];

        this.canDeduceFormat = true;
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
* TODO Unit tests
*/
export class DcatFormatMeasure extends Measure {
    public relatedDistribution: Record;

    private applyTransform(format: string, transformFormat: any) {
        const newFormat = transformFormat(format);
        return newFormat;
    }

    private empty(str: string) {
        return "";
    }

    private lowerCase(str: string) {
        return str.toLowerCase();
    }

    private removePeriod(str: string) {
       return str.split('.').join('');
    }

    private replaceCommaThenSpace(str: string) {
        return str.split(', ').join(' ');
    }

    private replaceSpaceThenComma(str: string) {
        return str.split(' ,').join(' ');
    }

    private replaceComma(str: string) {
        return str.split(',').join(' ');
    }

    private identity(str: string) {
        return str;
    }

    getSelectedFormats(): SelectedFormats {
        const { format } = this.relatedDistribution.aspects[
            "dcat-distribution-strings"
        ];

        if(format === null || format === "") {
            this.canDeduceFormat = false;
            return null;
        }

        let processedFormat: string;

        const transforms = [
            this.identity,
            (str: string) => this.lowerCase(this.removePeriod(this.replaceComma(this.replaceSpaceThenComma(this.replaceCommaThenSpace(str)))))
        ];

        for (const tf of transforms) {
            processedFormat = this.applyTransform(format, tf);
        }

        // hard coded rules for separating out multiple formats when provided
        let splitFormat: Array<string>;
        let finalFormat: Array<string>;

        // e.g: application/exe
        splitFormat = processedFormat.split("/");
        if (splitFormat.length > 2)
            throw new Error(
                "a MIME type has more than 1 slash: " + processedFormat
            );
        if (splitFormat.length > 1) finalFormat[0] = splitFormat[1];
        else {
            // E.g. pdf & xlsx & doc & docx
            splitFormat = processedFormat.split(" & ");
            if(splitFormat.length > 1) finalFormat = splitFormat;
            else {
                splitFormat = processedFormat.split(" ");
                if(splitFormat.length > 1) {
                    // E.g. zip (xlsx)
                    if(processedFormat.indexOf('(') > -1) {
                        //TODO make this more efficient or elegant
                        let length: number = (processedFormat.substr(processedFormat.indexOf(')')).length - processedFormat.substr(processedFormat.indexOf('(')).length);
                        finalFormat[0] = processedFormat.substr(processedFormat.indexOf('('), length);
                    } else {
                        // E.g. ATOM
                        finalFormat = splitFormat;
                    }
                } else {
                    // can only deduce 1 format in this scenario
                    finalFormat[0] = processedFormat;
                }
            }
        }

        this.canDeduceFormat = true;
        return {
            selectedFormats: finalFormat.map(eachFormat => {
                return {
                    format: (<any>Formats)[eachFormat],
                    correctConfidenceLevel: 100,
                    distribution: this.relatedDistribution
                };
            })
        };
    }
}

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
* TODO not finished
*/
export class DownloadExtensionMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        const { downloadURL } = this.relatedDistribution.aspects[
            "dcat-distribution-strings"
        ];

        if(downloadURL === null || downloadURL === "") {
            this.canDeduceFormat = false;
            return null;
        }

        //NOTE regexes do not allow more than 1 regex to match 1 url + break in forEach loop does this too
        // but this Measure has been programmed to make it easily extensible to allowing multiple formats
        // to be deduced by 1 url
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

        let formatsFromURL: Array<string> = [];
        urlRegexes.some(function(regex) {
            if (downloadURL.matches(regex[0])) {
                formatsFromURL.push(regex[1]);
                return true; // means 'break'
            }

            return false; // means 'continue'
        })

        this.canDeduceFormat = true;
        return {
            selectedFormats: formatsFromURL.map(eachFormat => {
                return {
                    format: (<any>Formats)[eachFormat],
                    correctConfidenceLevel: 100,
                    distribution: this.relatedDistribution
                };
            })
        };
    }
}
