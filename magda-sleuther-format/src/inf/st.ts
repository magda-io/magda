import { Record } from "@magda/typescript-common/dist/generated/api";
import orf from "../onRecordFound";

export default function doAction(downloadURL: string, format: string) {
    let d = downloadURL || "www.google.com";
    let c = format || "pdf";

    console.log("the attributes are" + downloadURL + " " + format);
    return orf(getStub(downloadURL, format), null);
}
export function getStub(downloadURL: string, format: string) : Record {
    return {
        aspects: {
            "dataset-distributions": {
                distributions: [
                    {
                        aspects: {
                            "dcat-distribution-strings": {
                                format: format,
                                downloadURL: downloadURL
                            }
                        },
                        id: "1",
                        name: "hello there babe"
                    }
                ]
            }
        },
        id: "10",
        name: "hello there"
    }
}