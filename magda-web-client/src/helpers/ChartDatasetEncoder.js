import startCase from "lodash/startCase";
import map from "lodash/map";
import find from "lodash/find";
import filter from "lodash/filter";
import indexOf from "lodash/indexOf";
import forEach from "lodash/forEach";
import isArray from "lodash/isArray";
import sumBy from "lodash/sumBy";
import concat from "lodash/concat";
import takeRight from "lodash/takeRight";
import sortBy from "lodash/sortBy";
import * as d3 from "d3-collection";
import * as chrono from "chrono-node";
import escapeRegExp from "@magda/typescript-common/dist/util/escapeRegExp";

const AVAILABLE_CHART_TYPES = ["bar", "pie", "scatter", "line"];
const STRIP_NUMBER_REGEX = /[^\-\d.+]/g;

const UNKNOWN_AXIS_LABEL = "Unknown";
/** Columns with these names are more likely to be picked as the default column on the x axis */
const HIGH_PRIORITY_X_AXES = [
    "gender",
    "sex",
    "occupation",
    "state",
    "city",
    "company",
    "postcode",
    "category"
];
/** Columns with these names will not be picked as the default column on the x axis unless there's nothing else */
const LOW_PRIORITY_X_AXES = ["name"];
/** Columns with these names are more likely to be picked as the default column on the y axis */
const HIGH_PRIORITY_Y_AXES = [];
/** Columns with these names will not be picked as the default column on the y axis unless there's nothing else */
const LOW_PRIORITY_Y_AXES = ["count", "id"];

/** Columns with these terms in them will be overridden as category types */
const OVERRIDE_TO_CATEGORY_COLUMNS = [
    "id",
    "code",
    "lic",
    "identifier",
    "postcode",
    "sex",
    "suburb",
    "occupation",
    "gender",
    "abn",
    "acn",
    "afsl",
    "pcode",
    "month",
    "reason",
    "year",
    "country",
    /^registration number$/i,
    /^LIQ NUM$/i,
    /^REG AUD NUM$/i
];
/** Columns with these terms in them will be overridden as time types */
const OVERRIDE_TO_TIME_COLUMNS = [
    "date",
    "time",
    /(^|\W)start\W+dt(\W|$)/i,
    /(^|\W)end\W+dt(\W|$)/i
];
/** Columns with these terms in them will be overridden as numeric types */
const OVERRIDE_TO_NUMERIC_COLUMNS = [
    "amt",
    "amount",
    "sum",
    "count",
    "tax",
    "value",
    "length",
    "expenditure",
    "total"
];
const EXCLUDE_COLUMNS = ["long", "lat", "lng"];

const noDelimiterParser = {
    pattern: () => /(\d{2})(\d{2})(\d{4})/gi,
    extract: (context, match) => ({
        day: match[1],
        month: match[2],
        year: match[3]
    })
};

const customChrono = chrono.en.GB.clone();
customChrono.parsers.push(noDelimiterParser);

const parseNumber = (str) => {
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
    count: (v) => v.length,
    sum: (field) => (v) => sumBy(v, (d) => parseNumber(d[field]))
};

const rollupResult2Rows = function (
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
    forEach(r, (item) => {
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

function unknownIfBlank(input) {
    return !input || (typeof input === "string" && input.trim() === "")
        ? UNKNOWN_AXIS_LABEL
        : input;
}

const defaultChartOption = {
    legend: {
        type: "scroll",
        y: "bottom",
        orient: "horizontal",
        formatter: unknownIfBlank
    },
    tooltip: {
        trigger: "item",
        formatter: (params) => {
            return Object.keys(params.value)
                .map((key) => {
                    const rawValue = params.value[key];
                    const value =
                        rawValue.toString().trim().length > 0
                            ? rawValue
                            : UNKNOWN_AXIS_LABEL;

                    return `${startCase(
                        unknownIfBlank(key.replace(aggrLabelRegex, "$1"))
                    )}: ${value}`;
                })
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
    }

    str = (str + "").replace(/_/g, " ").trim();
    const stringKeywords = [];
    for (let i = 0; i < keywords.length; i++) {
        const item = keywords[i];
        if (item instanceof RegExp) {
            if (item.test(str)) {
                return true;
            }
        } else {
            stringKeywords.push(escapeRegExp(item));
        }
    }
    const r = new RegExp(`(^|\\W)(${stringKeywords.join("|")})(\\W|$)`, "i");
    return !!r.test(str);
}

function fieldDefAdjustment(field) {
    const outputField = { ...field };
    // we should take number & time column override as priority
    if (testKeywords(field.label, OVERRIDE_TO_NUMERIC_COLUMNS)) {
        outputField.numeric = true;
        outputField.category = false;
        outputField.time = false;
    } else if (testKeywords(field.label, OVERRIDE_TO_CATEGORY_COLUMNS)) {
        outputField.numeric = false;
        outputField.category = true;
        outputField.time = false;
    } else if (testKeywords(field.label, OVERRIDE_TO_TIME_COLUMNS)) {
        outputField.numeric = false;
        outputField.category = false;
        outputField.time = true;
    }
    return outputField;
}

function preProcessFields(headerRow, distribution, chartType) {
    let disFields =
        distribution.visualizationInfo && distribution.visualizationInfo.fields;
    if (!disFields) disFields = [];

    let newFields = map(disFields, (field, key) => ({
        ...field,
        idx: indexOf(headerRow, key),
        name: key,
        label: startCase(key),
        category: !field.time && !field.numeric,
        isAggr: false
    }));
    //--- filter out fields that cannot be located in CSV data. VisualInfo outdated maybe?
    newFields = filter(newFields, (item) => item.idx !== -1);
    // Filter out specifically excluded columns
    newFields = filter(
        newFields,
        (item) => !testKeywords(item.name, EXCLUDE_COLUMNS)
    );
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
    newFields = newFields.map(fieldDefAdjustment);

    const grouped = chartType !== "scatter";
    newFields = newFields.map((field) => {
        if (field.numeric && grouped) {
            field.label += " (Sum of All)";
        }
        return field;
    });

    newFields = newFields.map((field) => {
        if (!field.label || field.label.trim() === "") {
            field.label = field.name;
        }
        return field;
    });

    newFields = newFields.map((field) => {
        if (!field.label || field.label.trim() === "") {
            field.label = UNKNOWN_AXIS_LABEL;
        }
        return field;
    });

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
    forEach(aggrfields, (field) => (nest = nest.key((d) => d[field])));
    const result = nest.rollup((v) => aggrFunc(v)).entries(data);
    return rollupResult2Rows(result, aggrfields, aggrFuncName);
}

function formatDate(value) {
    const date = new Date(value);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function getFieldDataType(field) {
    if (field.time) return "time";
    if (field.numeric) return "number";
    return "ordinal";
}

function getDefaultColumn(
    availableColumns,
    highPriorityColumnNames = [],
    lowPriorityColumnNames = []
) {
    if (!availableColumns.length) {
        return null;
    }

    const firstAvailableHighPriorityCol = find(availableColumns, (field) =>
        testKeywords(field.label, highPriorityColumnNames)
    );

    if (firstAvailableHighPriorityCol) {
        return firstAvailableHighPriorityCol;
    }

    const firstNotLowPriorityCol = availableColumns.find(
        (field) => !testKeywords(field.label, lowPriorityColumnNames)
    );

    if (firstNotLowPriorityCol) {
        return firstNotLowPriorityCol;
    }

    return availableColumns[0];
}

class ChartDatasetEncoder {
    constructor() {
        this.fields = null;
        this.data = null;
        this.encode = null;
        this.xAxis = null;
        this.yAxis = null;
        this.chartType = null;
        this.distribution = null;
    }

    getNumberOfRowsUsed() {
        return this.data && this.data.length ? this.data.length : 0;
    }

    processData(distribution, dataLoadingResult) {
        if (
            this.distribution === distribution &&
            this.distribution.identifier === distribution.identifier &&
            dataLoadingResult
        ) {
            return;
        }
        this.distribution = distribution;
        this.data = dataLoadingResult.parseResult.data;
        this.preProcessData();
    }

    getNumericColumns() {
        return filter(this.fields, (field) => field.numeric);
    }

    getTimeColumns() {
        return filter(this.fields, (field) => field.time);
    }

    getCategoryColumns() {
        return filter(this.fields, (field) => field.category);
    }

    preProcessData() {
        if (!this.data || this.data.length < 1) {
            throw new Error("The data file loaded is empty.");
        }

        this.fields = preProcessFields(
            Object.keys(this.data[0]),
            this.distribution,
            this.chartType
        );

        //--- Present data by selected col's count
        const newFieldName = "Count of Rows";
        this.fields.push({
            idx: this.fields.length,
            name: newFieldName,
            label: newFieldName,
            time: false,
            numeric: true,
            category: false,
            isAggr: true,
            isAggrDone: false
        });

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
        const availableYColumns = this.getAvailableYCols();
        if (availableYColumns && availableYColumns.length > 0) {
            this.setY(
                getDefaultColumn(
                    availableYColumns,
                    HIGH_PRIORITY_Y_AXES,
                    LOW_PRIORITY_Y_AXES
                )
            );
        }

        const availableXColumns = this.getAvailableXCols();
        if (availableXColumns && availableXColumns.length > 0) {
            this.setX(
                getDefaultColumn(
                    availableXColumns,
                    HIGH_PRIORITY_X_AXES,
                    LOW_PRIORITY_X_AXES
                )
            );
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

        // Process again because the axes might change based on the chart type.
        this.preProcessData();
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

        const unsortedData = inner().map((datum) => {
            const rawValue = datum[this.xAxis.name];

            console.log(getFieldDataType(this.xAxis));

            if (getFieldDataType(this.xAxis) === "time") {
                const parsedDate = customChrono.parseDate(rawValue);
                console.log(rawValue, parsedDate);
                return { ...datum, [this.xAxis.name]: parsedDate || rawValue };
            } else {
                return datum;
            }
        });

        const sortFunc = (() => {
            if (getFieldDataType(this.xAxis) === "time") {
                return (datum) => {
                    const xValue = datum[this.xAxis.name];
                    return xValue.getTime ? xValue.getTime() : xValue;
                };
            } else {
                return (datum) => datum[this.xAxis.name];
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
                    if (this.yAxis.name === field.name) {
                        return {
                            ...prevValue,
                            yAxisIdx: idx
                        };
                    } else if (this.xAxis.name === field.name) {
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
                left: "center",
                show: false
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

            const axisLabel = {
                rotate: type === "category" ? 45 : 0,
                formatter: (() => {
                    if (type === "category") {
                        return (value) => {
                            if (!value || value.trim().length === 0) {
                                return UNKNOWN_AXIS_LABEL;
                            } else if (value.length > 20) {
                                return value.substring(0, 17) + "...";
                            } else {
                                return value;
                            }
                        };
                    } else if (type === "time") {
                        return formatDate;
                    }
                })()
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
                    sortBy(data, (item) => item[fieldName]),
                    100
                );
            }
        }

        if (this.chartType === "line") {
            option.series[0].areaStyle = {};
            option.series[0].symbolSize = data.length < 100 ? 4 : 1;
            option.series[0].lineStyle = { width: data.length < 100 ? 2 : 1 };
        }

        return option;
    }
}

ChartDatasetEncoder.isValidDistributionData = function (distribution) {
    try {
        ChartDatasetEncoder.validateDistributionData(distribution);
        return true;
    } catch (e) {
        return false;
    }
};

ChartDatasetEncoder.validateDistributionData = function (distribution) {
    if (!distribution) throw new Error("Invalid empty `distribution` data");
    if (!distribution.identifier)
        throw new Error(
            "Cannot locate `identifier` field of the distribution data"
        );
};

ChartDatasetEncoder.aggregators = aggregators;
ChartDatasetEncoder.avlChartTypes = AVAILABLE_CHART_TYPES;

export default ChartDatasetEncoder;
