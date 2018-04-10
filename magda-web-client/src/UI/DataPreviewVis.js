import "es6-symbol/implement";
import React, { Component } from "react";
import Tabs from "muicss/lib/react/tabs";
import Tab from "muicss/lib/react/tab";
import ChartConfig from "./ChartConfig";
import defined from "../helpers/defined";
import { fetchPreviewData } from "../actions/previewDataActions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import VegaLite from "react-vega-lite";
import DataPreviewTable from "./DataPreviewTable";
import { Medium } from "./Responsive";
import "./DataPreviewVis.css";

class DataPreviewVis extends Component {
    constructor(props) {
        super(props);
        this.updateChartConfig = this.updateChartConfig.bind(this);
        this.updateDimensions = this.updateDimensions.bind(this);
        this.state = {
            chartType: "line",
            chartTitle: "",
            yAxis: null,
            xAxis: null,
            xScale: "temporal",
            yScale: "quantitative",
            chartWidth: ""
        };
    }

    componentWillMount() {
        if (this.props.distribution) {
            this.props.fetchPreviewData(this.props.distribution);
        }
    }

    componentWillReceiveProps(nextProps) {
        if (
            nextProps.distribution.identifier !==
            this.props.distribution.identifier
        ) {
            this.props.fetchPreviewData(nextProps.distribution);
        }
        this.updateDimensions();
    }

    componentDidMount() {
        window.addEventListener("resize", this.updateDimensions);
        this.updateDimensions();
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateDimensions);
    }

    updateDimensions() {
        if (this.chartContainer) {
            // 1. check screensize
            const windowWidth = window.innerWidth;
            let width = 400;
            if (windowWidth > 992) {
                // big screen, use only half of the container width for chart
                width =
                    this.chartContainer.getBoundingClientRect().width / 2 - 48;
            } else {
                width = this.chartContainer.getBoundingClientRect().width - 48;
            }

            if (this.state.chartWidth !== width) {
                this.setState({
                    chartWidth: width
                });
            }
        }
    }

    updateChartConfig(id, value) {
        this.setState({
            [id]: value
        });
    }

    renderChart(previewData) {
        if (defined(previewData.meta.chartFields)) {
            const spec = {
                height: 263,
                width: this.state.chartWidth,
                description: this.state.chartTitle,
                mark: this.state.chartType,
                encoding: {
                    x: {
                        field: defined(this.state.xAxis)
                            ? this.state.xAxis
                            : previewData.meta.chartFields.time[0],
                        type: this.state.xScale
                    },
                    y: {
                        field: defined(this.state.yAxis)
                            ? this.state.yAxis
                            : previewData.meta.chartFields.numeric[0],
                        type: this.state.yScale
                    }
                }
            };

            const data = {
                values: previewData.data
            };

            const fileName = this.props.distribution.downloadURL
                .split("/")
                .pop()
                .split("#")[0]
                .split("?")[0];

            return (
                <div className="mui-row">
                    <div className="mui-col-md-6">
                        <div className="data-preview-vis_file-name">
                            {fileName}
                        </div>
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
                                yAxisOptions={
                                    previewData.meta.chartFields.numeric
                                }
                                xAxisOptions={previewData.meta.chartFields.time}
                                onChange={this.updateChartConfig}
                            />
                        </div>
                    </Medium>
                </div>
            );
        }
        return <div>Chart preview is not available</div>;
    }

    renderTable(previewData) {
        return <DataPreviewTable data={previewData} />;
    }

    renderByState() {
        if (this.props.error) return <div>Preview errored!</div>;
        if (this.props.isFetching) return <div>Preview is loading...</div>;
        if (
            this.props.data &&
            this.props.distribution &&
            this.props.distribution.identifier
        ) {
            const previewData = this.props.data[
                this.props.distribution.identifier
            ];
            if (
                previewData &&
                previewData.meta &&
                (previewData.meta.chartFields || previewData.meta.fields)
            ) {
                return (
                    <Tabs
                        defaultSelectedIndex={defined(
                            previewData.meta.chartFields
                        )}
                    >
                        <Tab value="table" label="Table">
                            {this.renderTable(previewData)}
                        </Tab>
                        <Tab value="chart" label="Chart">
                            {this.renderChart(previewData)}
                        </Tab>
                    </Tabs>
                );
            }
        }
        return null; //-- requested by Tash: hide the section if no data available
    }

    render() {
        const bodyRenderResult = this.renderByState();
        if (!bodyRenderResult) return null;
        return (
            <div
                className="data-preview-vis"
                ref={chartContainer => {
                    this.chartContainer = chartContainer;
                }}
            >
                <h3>Data Preview</h3>
                {bodyRenderResult}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const previewData = state.previewData;
    const data = previewData.previewData;
    const isFetching = previewData.isFetching;
    const error = previewData.error;
    const url = previewData.url;
    return {
        data,
        isFetching,
        error,
        url
    };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators(
        {
            fetchPreviewData: fetchPreviewData
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(DataPreviewVis);
