import { Record } from "magda-typescript-common/src/generated/registry/api";
import _ from "lodash";

/**
 * Gets an array of the individual urls from every distribution inside a dataset record, including both downloadURL and accessURL.
 */
export default function urlsFromDataSet(record: Record): string[] {
    return _(record.aspects["dataset-distributions"].distributions)
        .map((dist: any) => dist.aspects["dcat-distribution-strings"])
        .flatMap(({ downloadURL, accessURL }) => [downloadURL, accessURL])
        .filter(x => !!x)
        .value();
}
