import startCase from "lodash/startCase";
import map from "lodash/map";
import find from "lodash/find";
import filter from "lodash/filter";
import indexOf from "lodash/indexOf";
import forEach from "lodash/forEach";
import isArray from "lodash/isArray";
import sumBy from "lodash/sumBy";
import concat from "lodash/concat";
import trim from "lodash/trim";
import takeRight from "lodash/takeRight";
import sortBy from "lodash/sortBy";
import * as d3 from "d3-collection";
import { config } from "../config";
import chrono from "chrono-node";
import type { ParsedDistribution } from "../helpers/record";

const AVAILABLE_CHART_TYPES = ["bar", "pie", "scatter", "line"];
const STRIP_NUMBER_REGEX = /[^\-\d.+]/g;

const getPapaParse = (() => {
    let Papa = null;

    return async () => {
        if (!Papa) {
            Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
        }

        return Papa;
    };
})();

const fetchData = function(url) {
    return getPapaParse().then(
        Papa =>
            new Promise((resolve, reject) => {
                Papa.parse(config.proxyUrl + "_0d/" + url, {
                    download: true,
                    header: true,
                    skipEmptyLines: true,
                    trimHeader: true,
                    complete: results => {
                        resolve(results);
                    },
                    error: err => {
                        let e;
                        if (!err)
                            e = new Error(
                                "Failed to retrieve or parse the file."
                            );
                        else e = err;
                        reject(e);
                    }
                });
            })
    );
};

const parseNumber = str => {
    let parsedResult = 0;
    try {
        if (typeof str === "number") return str;
        if (typeof str !== "string") return 0;
        const isFloat = str.indexOf(".") !== -1;
        str = str.replace(STRIP_NUMBER_REGEX, "");
        if (isFloat) parsedResult = parseFloat(str);
        else parsedResult = parseInt(str, 10);
        if (isNaN(parsedResult)) return 0;
        return parsedResult;
    } catch (e) {
        console.error(e);
        return 0;
    }
};

const aggregators = {
    count: v => v.length,
    sum: field => v => sumBy(v, d => parseNumber(d[field]))
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

const aggrLabelRegex = /^(count|sum)(_0\.+\d+)$/i;

const defaultChartOption = {
    legend: {
        type: "scroll",
        y: "bottom",
        orient: "horizontal"
    },
    tooltip: {
        trigger: "item",
        formatter: (a, b, c, d, e, f, g, h) => {
            return Object.keys(a.value)
                .map(
                    key =>
                        `${startCase(key.replace(aggrLabelRegex, "$1"))}: ${
                            a.value[key]
                        }`
                )
                .join("<br/>");
        }
    },
    grid: {
        right: 10
    },
    //http://colorbrewer2.org/#type=sequential&scheme=BuPu&n=3
    color: ["#8856a7", "#9ebcda", "#e0ecf4"]
};

function testKeywords(str, keywords) {
    if (!str) {
        return false;
    } else if (!keywords || !keywords.length) {
        return false;
    } else {
        const r = new RegExp(`.*(${keywords.join("|")}).*`, "i");
        return !!r.test(str);
    }
}

function fieldDefAdjustment(field) {
    if (
        testKeywords(field.label, [
            "id",
            "code",
            "identifier",
            "postcode",
            "age",
            "sex",
            "suburb",
            "occupation",
            "gender",
            "abn",
            "acn",
            "afsl",
            "pcode",
            "lic num"
        ])
    ) {
        return {
            numeric: false,
            category: true,
            time: false
        };
    } else if (testKeywords(field.label, ["date", "year"])) {
        field.numeric = false;
        field.category = false;
        field.time = true;
    } else if (testKeywords(field.label, ["amt", "amount", "sum"])) {
        field.numeric = true;
        field.category = false;
        field.time = false;
    }
    return field;
}

function preProcessFields(headerRow, distribution) {
    let disFields =
        distribution.visualizationInfo && distribution.visualizationInfo.fields;
    if (!disFields) disFields = [];

    let newFields = map(disFields, (field, key) =>
        fieldDefAdjustment({
            ...field,
            idx: indexOf(headerRow, key),
            name: key,
            label: startCase(key),
            category: !field.time && !field.numeric,
            isAggr: false
        })
    );
    //--- filter out fields that cannot be located in CSV data. VisualInfo outdated maybe?
    newFields = filter(newFields, item => item.idx !== -1);
    if (!newFields.length) {
        //--- we will not exit but make our own guess
        newFields = map(headerRow, (headerName, idx) => ({
            idx,
            name: headerName,
            label: startCase(headerName),
            category: true,
            time: false,
            numeric: false,
            isAggr: false
        }));
    }
    newFields = filter(newFields, item => trim(item.name) !== "");
    if (!newFields.length) {
        throw new Error("The data file contains no non-empty header.");
    }
    return newFields;
}

/**
 * Simple aggregation function.
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
function groupBy(data, aggrFuncName, aggrFunc, aggrfields) {
    if (!data) {
        throw new Error("`data` cannot be empty!");
    }
    if (!aggrfields.length) {
        throw new Error("`aggrfields` cannot be empty array!");
    }
    let nest = d3.nest();
    forEach(aggrfields, field => (nest = nest.key(d => d[field])));
    const result = nest.rollup(v => aggrFunc(v)).entries(data);
    return rollupResult2Rows(result, aggrfields, aggrFuncName);
}

function getFieldDataType(field) {
    if (field.time) return "time";
    if (field.numeric) return "number";
    return "ordinal";
}

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

    init(distribution: ParsedDistribution) {
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

    preProcessData() {
        if (!this.data || this.data.length < 1) {
            throw new Error("The data file loaded is empty.");
        }

        this.fields = preProcessFields(
            Object.keys(this.data[0]),
            this.distribution
        );

        //--- if only one non-numeric column, add new column by count
        if (this.fields.length === 1 && !this.fields[0].numeric) {
            const newFieldName = "count";
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
            this.data = groupBy(this.data, newFieldName, aggregators.count, [
                this.fields[0].name
            ]);
        } else {
            //--- if unfortunately no numeric cols, present data by selected col's count
            // if (!this.getNumericColumns().length) {
            const newFieldName = "count";
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
        if (
            !this.getTimeColumns().length &&
            !this.getCategoryColumns().length
        ) {
            const newFieldName = "rows_" + Math.random();
            this.fields.push({
                idx: this.fields.length - 1,
                name: newFieldName,
                label: "Rows",
                time: false,
                numeric: false,
                category: true,
                isAggr: false,
                isAggrDone: false
            });
            this.data = map(
                this.data,
                (item, key) => (item[newFieldName] = `Row ${key + 1}`)
            );
        }
    }

    async performDataLoading(url) {
        try {
            this.isDataLoading = true;
            const result = await fetchData(url);
            //--- detect if another loading has started
            if (this.loadingUrl !== url) return;
            this.data = result.data;
            this.preProcessData();
            this.isDataLoaded = true;
        } catch (e) {
            this.isDataLoading = false;
            throw e;
        }
    }

    async loadData() {
        const url = this.distribution.downloadURL;
        if (this.isDataLoading && url === this.loadingUrl) {
            if (this.loadingPromise) await this.loadingPromise;
            return;
        }
        this.loadingUrl = url;
        const loadingPromise = this.performDataLoading(url);
        this.loadingPromise = loadingPromise;
        await loadingPromise;
    }

    getAvailableXCols() {
        //--- category / dimension axis
        const timeCols = this.getTimeColumns();
        const catCols = this.getCategoryColumns();
        const avlCols = concat(timeCols, catCols);
        return avlCols;
    }

    getAvailableYCols() {
        //--- value / measure axis
        const numCols = this.getNumericColumns();
        //--- there will be always at leaset one Ycol as preprocessed
        return numCols;
    }

    setDefaultAxis() {
        const avlYcols = this.getAvailableYCols();
        //-- avoid set an ID col to Y by default
        if (avlYcols.length > 1) this.setY(avlYcols[1]);
        else this.setY(avlYcols[0]);

        const higherPriorityNames = [
            "gender",
            "sex",
            "occupation",
            "state",
            "city",
            "company",
            "postcode",
            "category"
        ];
        const avlXcols = this.getAvailableXCols();
        const avlTimeXcols = filter(avlXcols, field => field.time);
        const avlCatXcols = filter(avlXcols, field => field.category);
        if (avlCatXcols.length) {
            //--- CatCol has higher priority
            const xAxis = find(avlCatXcols, field =>
                testKeywords(field.label, higherPriorityNames)
            );
            if (xAxis) this.setX(xAxis);
            else if (avlCatXcols.length > 1) this.setX(avlCatXcols[1]);
            else this.setX(avlCatXcols[0]);
        } else {
            this.setX(avlTimeXcols[0]);
        }
    }

    setDefaultChartType() {
        this.setChartType("pie");
    }

    setDefaultParameters() {
        this.setDefaultChartType();
        this.setDefaultAxis();
    }

    setX(field) {
        this.xAxis = field;
    }

    setY(field) {
        this.yAxis = field;
    }

    setChartType(chartType) {
        if (indexOf(AVAILABLE_CHART_TYPES, chartType) === -1)
            throw new Error("Unsupported chart type.");
        this.chartType = chartType;
    }

    getData() {
        const inner = () => {
            if (this.yAxis.isAggr) {
                //--- we need to aggregate data first
                if (this.yAxis.isAggrDone) {
                    return this.data;
                } else {
                    return groupBy(
                        this.data,
                        this.yAxis.name,
                        aggregators.count,
                        [this.xAxis.name]
                    );
                }
            } else if (this.chartType === "scatter") {
                return this.data;
            } else {
                return groupBy(
                    this.data,
                    this.yAxis.name,
                    aggregators.sum(this.yAxis.name),
                    [this.xAxis.name]
                );
            }
        };

        const unsortedData = inner().map(datum => {
            const rawValue = datum[this.xAxis.name];

            if (getFieldDataType(this.xAxis) === "time") {
                // Parse a date
                const parsedDate = chrono.en_GB.parseDate(rawValue);
                return { ...datum, [this.xAxis.name]: parsedDate || rawValue };
                // } else if (getFieldDataType(this.xAxis) === "ordinal") {
                //     // Truncate the category
                //     return {
                //         ...datum,
                //         [this.xAxis.name]:
                //             rawValue.length > 15
                //                 ? rawValue.substring(0, 12) + "..."
                //                 : rawValue
                //     };
            } else {
                return datum;
            }
        });

        const sortFunc = (() => {
            if (getFieldDataType(this.xAxis) === "time") {
                return datum => {
                    const xValue = datum[this.xAxis.name];
                    return xValue.getTime ? xValue.getTime() : xValue;
                };
            } else {
                return datum => datum[this.xAxis.name];
            }
        })();

        const data = sortBy(unsortedData, sortFunc);

        return data;
    }

    getDimensions() {
        if (this.chartType === "scatter") {
            return map(this.fields, (field, idx) => {
                const dimensionDef = {
                    name: field.name,
                    type: getFieldDataType(field),
                    displayName: field.label
                };
                return dimensionDef;
            });
        } else {
            return [
                {
                    name: this.xAxis.name,
                    type: getFieldDataType(this.xAxis),
                    displayName: this.xAxis.label
                },
                {
                    name: this.yAxis.name,
                    type: "number",
                    displayName: this.yAxis.label
                }
            ];
        }
    }

    getEncodeXYNames() {
        switch (this.chartType) {
            case "pie":
                return { xName: "itemName", yName: "value" };
            default:
                return { xName: "x", yName: "y" };
        }
    }

    getEncode() {
        const { xName, yName } = this.getEncodeXYNames();

        if (this.chartType === "scatter") {
            const { xAxisIdx, yAxisIdx, tooltipCols } = this.fields.reduce(
                (prevValue, field, idx) => {
                    if (this.yAxis === field) {
                        return {
                            ...prevValue,
                            yAxisIdx: idx
                        };
                    } else if (this.xAxis === field) {
                        return {
                            ...prevValue,
                            xAxisIdx: idx
                        };
                    } else {
                        return {
                            ...prevValue,
                            tooltipCols: prevValue.tooltipCols.concat([idx])
                        };
                    }
                },
                { tooltipCols: [] }
            );

            return {
                [xName]: xAxisIdx,
                [yName]: yAxisIdx,
                tooltip: concat([yAxisIdx], tooltipCols)
            };
        } else {
            return {
                [xName]: 0,
                [yName]: 1,
                tooltip: [1]
            };
        }
    }

    encodeDataset() {
        if (!this.chartType || !this.xAxis || !this.yAxis)
            throw new Error(
                "`Chart Type`, preferred `xAxis` or `yAxis` are required."
            );

        const data = this.getData();
        const dimensions = this.getDimensions();
        const encode = this.getEncode();

        return { dimensions, encode, data };
    }

    getChartOption(chartTitle) {
        const { data, dimensions, encode } = this.encodeDataset();
        const { xName } = this.getEncodeXYNames();
        const option = {
            ...defaultChartOption,
            title: {
                text: chartTitle,
                left: "center"
            },
            dataset: [
                {
                    source: data,
                    dimensions
                }
            ],
            series: [
                {
                    type: this.chartType,
                    encode
                }
            ],
            grid: { bottom: 120, y2: 100 }
        };

        if (xName === "x") {
            const getType = () => {
                if (this.xAxis.time) {
                    return "time";
                } else if (this.xAxis.numeric) {
                    return "value";
                } else {
                    return "category";
                }
            };

            const type = getType();

            const axisLabel = type === "category" && {
                rotate: type === "category" ? 45 : 0,
                formatter: value =>
                    value.length > 18 ? value.substring(0, 15) + "..." : value
            };

            option.xAxis = {
                ...option.xAxis,
                type,
                axisLabel,
                show: true
            };
            option.yAxis = {
                ...option.yAxis,
                type: "value",
                show: true
            };
        }

        if (this.chartType === "pie") {
            option.series[0].label = {
                show: false
            };
            option["yAxis"] = { show: false };
            option["xAxis"] = { show: false };
            option.grid.show = false;
            //--- if too much data, tuncate the data to avoid slowing down browser
            if (data.length > 100) {
                const fieldName = dimensions[encode.value].name;
                option.dataset[0].source = takeRight(
                    sortBy(data, item => item[fieldName]),
                    100
                );
            }
            option.dataZoom = [{ show: false }];
        } else {
            option.dataZoom = [
                {
                    type: "slider",
                    show: true
                }
            ];
        }

        if (this.chartType === "line") {
            option.series[0].areaStyle = {};
        }

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
};

ChartDatasetEncoder.aggregators = aggregators;
ChartDatasetEncoder.avlChartTypes = AVAILABLE_CHART_TYPES;

export default ChartDatasetEncoder;
