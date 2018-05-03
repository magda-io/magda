import React, { Component } from "react";
import { config } from "../config";
import ChartConfig from "./ChartConfig";
import defined from "../helpers/defined";
import VegaLite from "react-vega-lite";
import { Medium } from "./Responsive";
import Spinner from "../Components/Spinner";

import type { ParsedDistribution } from "../helpers/record";

function loadPapa() {
    return import(/* webpackChunkName: "papa" */ "papaparse")
        .then(papa => {
            return papa;
        })
        .catch(error => {
            throw new Error("An error occurred while loading the component");
        });
}

// This class can be instantiated for multiple distributions on the same page
// Don't use global state in redux
export default class DataPreviewVega extends Component<{
    distribution: ParsedDistribution
}> {
    constructor(props) {
        super(props);
        this.updateChartConfig = this.updateChartConfig.bind(this);
        this.updateDimensions = this.updateDimensions.bind(this);
        this.state = {
            error: null,
            loading: true,
            parsedResults: null,
            chartType: "line",
            chartTitle: "",
            yAxis: null,
            xAxis: null,
            xScale: "temporal",
            yScale: "quantitative",
            chartWidth: ""
        };
        this.chartWidthDiv = null;
    }

    componentDidMount() {
        window.addEventListener("resize", this.updateDimensions);
        if (defined(this.props.distribution.chartFields)) {
            this.fetchData(this.props.distribution.downloadURL);
        }
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateDimensions);
    }

    componentDidUpdate() {
        this.updateDimensions();
    }

    updateDimensions() {
        if (this.chartWidthDiv) {
            // 1. check screensize
            const windowWidth = window.innerWidth;
            let width = 400;
            if (windowWidth > 992) {
                // big screen, use only half of the container width for chart
                width =
                    this.chartWidthDiv.getBoundingClientRect().width / 2 - 96;
            } else {
                width = this.chartWidthDiv.getBoundingClientRect().width - 48;
            }

            if (this.state.chartWidth !== width) {
                this.setState({
                    chartWidth: width
                });
            }
        }
    }

    componentWillReceiveProps(nextProps) {
        if (
            nextProps.distribution.downloadURL !==
                this.props.distribution.downloadURL &&
            defined(nextProps.distribution.chartFields)
        ) {
            this.fetchData(nextProps.distribution.downloadURL);
        }
        // this.updateDimensions();
    }

    fetchData(url) {
        this.setState({
            error: null,
            loading: true,
            parsedResults: null
        });
        return loadPapa()
            .then(papa => {
                return new Promise((resolve, reject) => {
                    papa.parse(config.proxyUrl + "_0d/" + url, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: results => {
                            resolve(results);
                        },
                        error: err => {
                            reject(err);
                        }
                    });
                });
            })
            .then(results => {
                this.setState({
                    error: null,
                    loading: false,
                    parsedResults: results
                });
            })
            .catch(err => {
                this.setState({
                    error: err,
                    loading: false,
                    parsedResults: null
                });
            });
    }

    updateChartConfig(id, value) {
        this.setState({
            [id]: value
        });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="error">
                    <h3>{this.state.error.name}</h3>
                    {this.state.error.message}
                </div>
            );
        }

        const chartFields = this.props.distribution.chartFields;
        if (!defined(chartFields)) {
            return <div>Chart preview is not available</div>;
        }

        if (this.state.loading) {
            return <Spinner height="420px" />;
        }

        const spec = {
            height: 263,
            width: this.state.chartWidth,
            description: this.state.chartTitle,
            mark: this.state.chartType,
            encoding: {
                x: {
                    field: defined(this.state.xAxis)
                        ? this.state.xAxis
                        : chartFields.time[0],
                    type: this.state.xScale
                },
                y: {
                    field: defined(this.state.yAxis)
                        ? this.state.yAxis
                        : chartFields.numeric[0],
                    type: this.state.yScale
                }
            }
        };
        const data = {
            values: this.state.parsedResults.data
        };
        const fileName = this.props.distribution.downloadURL
            .split("/")
            .pop()
            .split("#")[0]
            .split("?")[0];

        return (
            <div
                className="mui-row"
                ref={chartWidthDiv => {
                    this.chartWidthDiv = chartWidthDiv;
                }}
            >
                <div className="mui-col-md-6">
                    <div className="data-preview-vis_file-name">{fileName}</div>
                    <VegaLite
                        className="data-preview-vis_chart"
                        spec={spec}
                        data={data}
                    />
                </div>
                <Medium>
                    <div className="mui-col-md-6">
                        <ChartConfig
                            chartType={spec.mark}
                            chartTitle={spec.description}
                            xScale={spec.encoding.x.type}
                            yScale={spec.encoding.y.type}
                            xAxis={spec.encoding.x.field}
                            yAxis={spec.encoding.x.field}
                            yAxisOptions={chartFields.numeric}
                            xAxisOptions={chartFields.time}
                            onChange={this.updateChartConfig}
                        />
                    </div>
                </Medium>
            </div>
        );
    }
}
