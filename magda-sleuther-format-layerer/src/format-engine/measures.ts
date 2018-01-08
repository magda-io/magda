import { Measure } from "@magda/typescript-common/src/format/Measure";
import { Record } from "@magda/typescript-common/src/generated/registry/api";
import { SelectedFormats } from "../../../magda-typescript-common/src/format/formats";
import * as mimeTypes from "mime-types";
import { Formats } from "@magda/typescript-common/src/format/formats";

/*
* Tries to determine the format by downloading the downloadURL, and deciphering the MIME type
* TODO not finished
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
* TODO not finished
*/
class DcatFormatMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        let {
            default: Registry
        } = require("@magda/typescript-common/dist/Registry");
        let {
            default: AsyncPage,
            forEachAsync
        } = require("@magda/typescript-common/dist/AsyncPage");
        let fs = require("fs");

        let {
            Record
        } = require("@magda/typescript-common/dist/generated/registry/api");
        const registry = new Registry({
            baseUrl:
                process.env.REGISTRY_URL ||
                process.env.npm_package_config_registryUrl ||
                "http://localhost:6100/v0"
        });

        let formats = {};

        let maxPages = Infinity;

        const registryPage = AsyncPage.create(previous => {
            console.log(`Fetching page ${previous ? previous._pagei + 1 : 0}`);
            if (previous === undefined) {
                return registry
                    .getRecords(["dcat-distribution-strings"])
                    .then(page => Object.assign({}, page, { _pagei: 0 }));
            } else if (
                previous.records.length === 0 ||
                previous._pagei >= maxPages - 1
            ) {
                // Last page was an empty page, no more records left
                return undefined;
            } else {
                return registry
                    .getRecords(
                        ["dcat-distribution-strings"],
                        undefined,
                        previous.nextPageToken,
                        undefined
                    )
                    .then(page =>
                        Object.assign({}, page, { _pagei: previous._pagei + 1 })
                    );
            }
        }).map(page => page.records);

        let p = forEachAsync(registryPage, 20, record => {
            const { downloadURL, format } = record.aspects[
                "dcat-distribution-strings"
            ];
            formats[format] = (formats[format] || 0) + 1;
        }).then(() => {
            fs.writeFileSync("formats.json", JSON.stringify(formats, null, 2));
        });
    }
}

/*
* Tries to determine the format by parsing the downloadURL string and looking at the extension
* TODO not finished
*/
class DownloadExtensionMeasure extends Measure {
    public relatedDistribution: Record;
    getSelectedFormats(): SelectedFormats {
        throw new Error("Method not implemented.");
    }
}
