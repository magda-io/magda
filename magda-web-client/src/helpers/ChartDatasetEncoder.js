import capitalize from "lodash/capitalize";
import map from "lodash/map";
import find from "lodash/find";
import filter from "lodash/filter";
import indexOf from "lodash/indexOf";
import reduce from "lodash/reduce";
import zip from "lodash/zip";
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
        if(this.fields.length===1){
            this.fields.push({
                idx: 1,
                name: "count",
                label: "Count",
                time: false,
                numeric: true
            });

        }
    }

    groupBy(data, aggr:function, ...fields){
        const calTable = reduce(data, (result, row)=>{
            const key = fields.map(field=> data.map(item=>item[field.idx]) )
        },{});
    }

    async loadData(url) {
        if (!Papa)
            Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
        const result = await fetchData(url);
        this.data = result.data;
    }

    getAvailableXCols(){

    }

    getAvailableYCols(){

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

export default ChartDatasetEncoder;
