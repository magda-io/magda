import capitalize from "lodash/capitalize";
import map from "lodash/map";
import find from "lodash/find";
import filter from "lodash/filter";
import indexOf from "lodash/indexOf";
import forEach from "lodash/forEach";
import isArray from "lodash/isArray";
import sumBy from "lodash/sumBy";
import concat from "lodash/concat";
import * as d3 from "d3-collection";
import { config } from "../config";
import type { ParsedDistribution } from "../helpers/record";

let Papa = null;

const fetchData = function(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(config.proxyUrl + "_0d/" + url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            trimHeader: true,
            complete: results => {
                resolve(results);
            },
            error: err => {
                reject(err);
            }
        });
    });
};

const aggregators = {
    "count" : v => v.length,
    "sum" : field => v => sumBy(v, d => d[field])
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

    getNumericColumns() {
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
            label: capitalize(key.replace(/[-_]/g, " ")),
            isAggr: false
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
        if (!this.data || this.data.length < 1)
            throw new Error("The data file loaded is empty.");
        this.preProcessFields(Object.keys(this.data[0]));
        //--- if only one non-numeric column, add new column by count
        if (this.fields.length === 1 && !this.fields[0].numeric) {
            const newFieldName = "count_"+Math.random();
            this.fields.push({
                idx: 1,
                name: newFieldName,
                label: "Count",
                time: false,
                numeric: true,
                isAggr: true
            });
            this.data = this.groupBy(this.data, newFieldName, aggregators.count, [this.fields[0].name]);
        }
        //--- At least one x-axis-able column / dimension should present
        if(!this.getTimeColumns().length && !this.getCategoryColumns().length){
            const newFieldName = "rows_"+Math.random();
            this.fields.push({
                idx: this.fields.length-1,
                name: newFieldName,
                label: "Rows",
                time: false,
                numeric: false,
                isAggr: false
            });
            this.data = map(this.data, (item,key)=> item[newFieldName]=`Row ${key+1}`);
        }
    }

    /**
     * Simply aggregation function.
     * @param {Array} data : data rows
     * @param {String} aggrFuncName 
     * @param {Function} aggrFunc 
     * @param {Array} aggrfields 
     * 
     * Examples: 
     *  with data: 
     * 
     * expenses = [{"name":"jim","amount":34,"date":"11/12/2015"},
     *   {"name":"carl","amount":120.11,"date":"11/12/2015"},
     *   {"name":"jim","amount":45,"date":"12/01/2015"},
     *   {"name":"stacy","amount":12.00,"date":"01/04/2016"},
     *   {"name":"stacy","amount":34.10,"date":"01/04/2016"},
     *   {"name":"stacy","amount":44.80,"date":"01/05/2016"}
     * ];
     * 
     *  groupBy(expenses,'Count',aggregators.count,["name","date"]);
     *  or:
     *  groupBy(expenses,'Sum',aggregators.sum("amount"),["name","date"]);
     *  
     */
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

    getAvailableXCols() { //--- category / dimension axis
        const timeCols = this.getTimeColumns();
        const catCols = this.getCategoryColumns();
        const avlCols = concat(timeCols, catCols);
        return avlCols();
    }

    getAvailableYCols() {  //--- value / measure axis
        const numCols = this.getNumericColumns();
        //--- if unfortunately no numeric cols, present data by selected col's count
        if(!numCols.length) return this.getAvailableXCols(); 
        return numCols;
    }
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

ChartDatasetEncoder.aggregators = aggregators;

export default ChartDatasetEncoder;
