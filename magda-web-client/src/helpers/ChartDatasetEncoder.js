import capitalize from "lodash/capitalize";
import map from "lodash/map";
import find from "lodash/find";
import filter from "lodash/filter";
import indexOf from "lodash/indexOf";
import forEach from "lodash/forEach";
import isArray from "lodash/isArray";
import * as d3 from "d3-collection";
import { config } from "../config";
import type { ParsedDistribution } from "../helpers/record";

let Papa = null;

const fetchData = function(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(config.proxyUrl + "_0d/" + url, {
            download: true,
            header: false,
            skipEmptyLines: true,
            complete: results => {
                resolve(results);
            },
            error: err => {
                reject(err);
            }
        });
    });
};

const rollupResult2Rows = function(
    r,
    groupByFields,
    aggrFuncName = null,
    aggrResult = [],
    mergedKeyObj = {}
) {
    if (!aggrFuncName) aggrFuncName = "value";
    if (!isArray(r)) {
        const finalMergedKeyObj = { ...mergedKeyObj };
        finalMergedKeyObj[aggrFuncName] = r;
        aggrResult.push(finalMergedKeyObj);
        return aggrResult;
    }
    if (!groupByFields.length) return aggrResult;
    const keyName = groupByFields.shift();
    if (typeof keyName === "undefined") return aggrResult;
    forEach(r, item => {
        const finalMergedKeyObj = { ...mergedKeyObj };

        finalMergedKeyObj[keyName] = item.key;
        rollupResult2Rows(
            typeof item.values !== "undefined" ? item.values : item.value,
            groupByFields,
            aggrFuncName,
            aggrResult,
            finalMergedKeyObj
        );
    });
    groupByFields.push(keyName);
    return aggrResult;
};

class ChartDatasetEncoder {
    constructor(distribution: ParsedDistribution) {
        ChartDatasetEncoder.validateDistributionData(distribution);
        this.distribution = distribution;
        this.fields = null;
        this.data = null;
        this.encode = null;
    }

    getNumericFields() {
        return filter(this.fields, field => field.numeric);
    }

    getTimeColumns() {
        return filter(this.fields, field => field.time);
    }

    getCategoryColumns() {
        return filter(this.fields, field => !field.time && !field.numeric);
    }

    get1stNumericColumn() {
        return find(this.fields, field => field.numeric);
    }

    get1stTimeColumn() {
        return find(this.fields, field => field.time);
    }

    get1stCategoryColumn() {
        return find(this.fields, field => !field.time && !field.numeric);
    }

    preProcessFields(headerRow) {
        const disFields = this.distribution.visualizationInfo.fields;

        let newFields = map(disFields, (field, key) => ({
            ...field,
            idx: indexOf(headerRow, key),
            name: key,
            label: capitalize(key.replace(/[-_]/g, " "))
        }));
        //--- filter out fields that cannot be located in CSV data. VisualInfo outdated maybe?
        newFields = filter(newFields, item => item.idx !== -1);
        if (!newFields.length)
            throw new Error(
                "Data file layout does not match existing visualisation info."
            );
        this.fields = newFields;
        return newFields;
    }

    preProcessData() {
        if (!this.data || this.data.length < 2)
            throw new Error("The data file loaded is empty.");
        this.preProcessFields(this.data.shift());
        if (this.fields.length === 1) {
            this.fields.push({
                idx: 1,
                name: "count",
                label: "Count",
                time: false,
                numeric: true
            });
        }
    }

    groupBy(data, aggrFuncName, aggrFunc, aggrfields) {
        if (!data) throw new Error("`data` cannot be empty!");
        if (!aggrfields.length)
            throw new Error("`aggrfields` cannot be empty array!");
        let nest = d3.nest();
        forEach(aggrfields, field => (nest = nest.key(d => d[field])));
        const result = nest.rollup(v => aggrFunc(v)).entries(data);
        return rollupResult2Rows(result, aggrfields, aggrFuncName);
    }

    async loadData(url) {
        if (!Papa)
            Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
        const result = await fetchData(url);
        this.data = result.data;
    }

    getAvailableXCols() {}

    getAvailableYCols() {}
}

ChartDatasetEncoder.isValidDistributionData = function(
    distribution: ParsedDistribution
) {
    try {
        ChartDatasetEncoder.validateDistributionData(distribution);
        return true;
    } catch (e) {
        return false;
    }
};

ChartDatasetEncoder.validateDistributionData = function(
    distribution: ParsedDistribution
) {
    if (!distribution) throw new Error("Invalid empty `distribution` data");
    if (!distribution.identifier)
        throw new Error(
            "Cannot locate `identifier` field of the distribution data"
        );
    if (!distribution.downloadURL)
        throw new Error(
            "Cannot locate `downloadURL` field of the distribution data"
        );
    if (
        !distribution.visualizationInfo ||
        !distribution.visualizationInfo.fields
    )
        throw new Error(
            "Cannot locate `visualization Information` of the distribution data"
        );
};

export default ChartDatasetEncoder;
