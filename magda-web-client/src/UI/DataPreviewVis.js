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
import "./DataPreviewVis.css";

class DataPreviewVis extends Component {
    constructor(props) {
        super(props);
        this.updateChartConfig = this.updateChartConfig.bind(this);
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
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.chartContainer) {
            const width =
                this.chartContainer.getBoundingClientRect().width - 48;
            if (prevState.chartWidth !== width) {
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
                    <div className="mui-col-sm-6">
                        <div
                            className="data-preview-vis_file-name"
                            ref={chartContainer => {
                                this.chartContainer = chartContainer;
                            }}
                        >
                            {fileName}
                        </div>
                        <VegaLite
                            className="data-preview-vis_chart"
                            spec={spec}
                            data={data}
                        />
                    </div>
                    <div className="mui-col-sm-6">
                        <ChartConfig
                            chartType={spec.mark}
                            chartTitle={spec.description}
                            xScale={spec.encoding.x.type}
                            yScale={spec.encoding.y.type}
                            xAxis={spec.encoding.x.field}
                            yAxis={spec.encoding.x.field}
                            yAxisOptions={previewData.meta.chartFields.numeric}
                            xAxisOptions={previewData.meta.chartFields.time}
                            onChange={this.updateChartConfig}
                        />
                    </div>
                </div>
            );
        }
        return <div>no chart here</div>;
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
            if (previewData) {
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
        return <div>No data preview available</div>;
    }

    render() {
        return (
            <div className="data-preview-vis">
                <h3>Data Preview</h3>
                {this.renderByState()}
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
