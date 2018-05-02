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

const avlChartTypes = [
    "bar",
    "pie",
    "scatter",
    "line"
];
const fetchData = function(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(config.proxyUrl + "_0d/" + url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            trimHeader: true,
            complete: (results) => {
                resolve(results);
            },
            error: (err) => {
                let e;
                if(!err) e = new Error("Failed to retrieve or parse the file.");
                else e = err;
                reject(e);
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

const defaultChartOption = {
    legend: {
        type: 'scroll',
        y:"bottom",
        orient: 'horizontal'
    }
};

class ChartDatasetEncoder {
    constructor(distribution: ParsedDistribution) {
        this.fields = null;
        this.data = null;
        this.encode = null;
        this.xAxis = null;
        this.yAxis = null;
        this.chartType = null;
        this.isDataLoaded = false;
        this.isDataLoading = false;
        this.loadingUrl = null;
        this.loadingPromise = null;
        this.init(distribution);
    }

    init(distribution: ParsedDistribution){
        ChartDatasetEncoder.validateDistributionData(distribution);
        this.distribution = distribution;
    }

    getNumericColumns() {
        return filter(this.fields, field => field.numeric);
    }

    getTimeColumns() {
        return filter(this.fields, field => field.time);
    }

    getCategoryColumns() {
        return filter(this.fields, field => field.category);
    }

    get1stNumericColumn() {
        return find(this.fields, field => field.numeric);
    }

    get1stTimeColumn() {
        return find(this.fields, field => field.time);
    }

    get1stCategoryColumn() {
        return find(this.fields, field => field.category);
    }

    preProcessFields(headerRow) {
        const disFields = this.distribution.visualizationInfo.fields;

        let newFields = map(disFields, (field, key) => ({
            ...field,
            idx: indexOf(headerRow, key),
            name: key,
            label: capitalize(key.replace(/[-_]/g, " ")),
            category: !field.time && !field.numeric,
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
                category: false,
                isAggr: true,
                isAggrDone: true
            });
            this.data = this.groupBy(this.data, newFieldName, aggregators.count, [this.fields[0].name]);
        }
        //--- if unfortunately no numeric cols, present data by selected col's count
        if(!this.getNumericColumns().length){
            const newFieldName = "count_"+Math.random();
            this.fields.push({
                idx: 1,
                name: newFieldName,
                label: "Count",
                time: false,
                numeric: true,
                category: false,
                isAggr: true,
                isAggrDone: false
            });
            //--- we cann't generate coutn data here yet as we don't know user's selection
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
                category: true,
                isAggr: false,
                isAggrDone: false
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

    async performDataLoading(url){
        try{
            this.isDataLoading = true;
            if (!Papa)
                Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
            const result = await fetchData(url);
            //--- detect if another loading has started
            if(this.loadingUrl!== url) return;
            this.data = result.data;
            this.preProcessData();
            this.isDataLoaded = true;
        }catch(e){
            this.isDataLoading = false;
            throw e;
        }
    }

    async loadData() {
        const url = this.distribution.downloadURL;
        if(this.isDataLoading && url === this.loadingUrl) {
            if(this.loadingPromise) await this.loadingPromise;
            return;
        }
        this.loadingUrl = url;
        const loadingPromise = this.performDataLoading(url);
        this.loadingPromise = loadingPromise;
        await loadingPromise;
    }

    getAvailableXCols() { //--- category / dimension axis
        const timeCols = this.getTimeColumns();
        const catCols = this.getCategoryColumns();
        const avlCols = concat(timeCols, catCols);
        return avlCols;
    }

    getAvailableYCols() {  //--- value / measure axis
        const numCols = this.getNumericColumns();
        //--- there will be always at leaset one Ycol as preprocessed
        return numCols;
    }

    setDefaultAxis(){
        const avlYcols = this.getAvailableYCols();
        //-- avoid set an ID col to Y by default
        if(avlYcols.length>1) this.setY(avlYcols[1]);
        else this.setY(avlYcols[0]);
        
        const avlXcols = this.getAvailableXCols();
        const avlTimeXcols = filter(avlXcols, field => field.time);
        const avlCatXcols = filter(avlXcols, field => field.category);
        if(avlTimeXcols.length) { //--- TimeCol has higher priority
            this.setX(avlTimeXcols[0]);
        }else{
            if(avlCatXcols.length>1) this.setY(avlCatXcols[1]);
            else this.setY(avlCatXcols[0]);
        }
    }

    setDefaultChartType(){
        this.setChartType("pie");
    }

    setDefaultParameters(){
        this.setDefaultChartType();
        this.setDefaultAxis();
    }

    setX(field){
        this.xAxis = field;
    }

    setY(field){
        this.yAxis = field;
    }

    setChartType(chartType){
        if(indexOf(avlChartTypes, chartType)===-1) throw new Error("Unsupported chart type.");
        this.chartType = chartType;
    }

    getFieldDataType(field){
        if(field.numeric) return "number";
        if(field.time) return "time";
        return "ordinal";
    }

    getEncodeXYNames(){
        switch(this.chartType){
            case "pie" : return {xName: "itemName", yName: "value"};
            case "funnel" : return {xName: "itemName", yName: "value"};
            default : return {xName: "x", yName: "y"};
        }
    }

    encodeDataset(){
        if(!this.chartType || !this.xAxis || !this.yAxis) throw new Error("`Chart Type`, preferred `xAxis` or `yAxis` are required.");
        let data, dimensions, encode;
        const { xName, yName} = this.getEncodeXYNames();
        if(this.yAxis.isAggr){ //--- we need aggregate data first
            if(this.yAxis.isAggrDone) data = this.data;
            else data = this.groupBy(this.data, this.yAxis.name, aggregators.count, [this.xAxis.name])
            dimensions = [{
                name: this.xAxis.name,
                type: "ordinal",
                displayName: this.xAxis.label
            },{
                name: this.yAxis.name,
                type: "int",
                displayName: this.yAxis.label
            }];
            encode = {
                [xName] : 0,
                [yName] : 1,
                tooltip: [1]
            };
        }else{
            let xAxisIdx = null;
            let yAxisIdx = null;
            let tooltipCols = [];
            dimensions = map(this.fields, (field,idx) => {
                if(this.yAxis===field) yAxisIdx=idx;
                else if(this.xAxis===field) xAxisIdx=idx;
                else tooltipCols.push(idx);
                const dimensionDef = {
                    name: field.name,
                    type: this.getFieldDataType(field),
                    displayName: field.label
                };
                return dimensionDef;
            });
            encode = {
                [xName] : xAxisIdx,
                [yName] : yAxisIdx,
                tooltip: concat([yAxisIdx],tooltipCols)
            };
            data = this.data;
        }
        return { dimensions, encode, data};
    }

    getChartOption(chartTitle){
        const { data, dimensions, encode } = this.encodeDataset();
        const option = {
            ...defaultChartOption,
            title: {
                text: chartTitle
            },
            dataset:[{
                source: data,
                dimensions,
            }],
            series:[{
                type: this.chartType,
                encode
            }]
        };
        return option;
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
ChartDatasetEncoder.avlChartTypes = avlChartTypes;

export default ChartDatasetEncoder;
