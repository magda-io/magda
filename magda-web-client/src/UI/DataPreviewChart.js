import React, { Component } from "react";
import { Small } from "./Responsive";
import Spinner from "../Components/Spinner";
import ChartDatasetEncoder from "../helpers/ChartDatasetEncoder";
import ChartConfig from "./ChartConfig";
import downArrowIcon from "../assets/downArrow.svg";
import upArrowIcon from "../assets/upArrow.svg";
import AUpageAlert from "../pancake/react/page-alerts";
import memoize from "memoize-one";
import { gapi } from "../analytics/ga";

import "./DataPreviewChart.scss";

let ReactEcharts = null;

const defaultChartType = "bar";

// we only do the auto redirect in the first time,
// subsequent tab switching does not trigger redirect
const switchTabOnFirstGo = memoize(
    props => props.onChangeTab("table"),
    (prev, next) =>
        prev.distribution.identifier === next.distribution.identifier
);

class DataPreviewChart extends Component {
    constructor(props) {
        super(props);
        this.state = this.getResetState({
            chartType: defaultChartType,
            isLoading: true,
            chartTitle: this.props.distribution.title
                ? this.props.distribution.title
                : "",
            isExpanded: true
        });
        this.chartDatasetEncoder = null;
        this.onChartConfigChanged = this.onChartConfigChanged.bind(this);
        this.onToggleButtonClick = this.onToggleButtonClick.bind(this);
        this.onDismissError = this.onDismissError.bind(this);
        this.isCancelled = false;
    }

    getResetState(extraOptions = null) {
        const options = {
            error: null,
            isLoading: false,
            avlXCols: [],
            avlYCols: [],
            xAxis: null,
            yAxis: null,
            chartOption: null
        };
        if (!extraOptions) return options;
        else return { ...options, ...extraOptions };
    }

    async initChartData() {
        try {
            if (
                ChartDatasetEncoder.isValidDistributionData(
                    this.props.distribution
                )
            ) {
                if (!this.chartDatasetEncoder)
                    this.chartDatasetEncoder = new ChartDatasetEncoder(
                        this.props.distribution
                    );
                else this.chartDatasetEncoder.init(this.props.distribution);
                if (!this.chartDatasetEncoder.isDataLoaded)
                    await this.chartDatasetEncoder.loadData();

                let chartType = this.state.chartType;
                if (!this.state.xAxis || !this.state.yAxis) {
                    this.chartDatasetEncoder.setDefaultParameters();
                    //if(this.chartDatasetEncoder.yAxis.isAggr) chartType = "pie";
                    // will not set to pie by default
                } else {
                    this.chartDatasetEncoder.setX(this.state.xAxis);
                    this.chartDatasetEncoder.setY(this.state.yAxis);
                }

                if (!chartType) chartType = defaultChartType;
                this.chartDatasetEncoder.setChartType(chartType);
                const chartOption = this.chartDatasetEncoder.getChartOption("");

                if (!this.isCancelled) {
                    this.setState({
                        error: null,
                        isLoading: false,
                        avlXCols: this.chartDatasetEncoder.getAvailableXCols(),
                        avlYCols: this.chartDatasetEncoder.getAvailableYCols(),
                        xAxis: this.chartDatasetEncoder.xAxis,
                        yAxis: this.chartDatasetEncoder.yAxis,
                        chartType,
                        chartOption
                    });
                }
            }
        } catch (e) {
            console.error(e);
            throw e; //--- not capture here; only for debug
        }
    }

    async componentDidMount() {
        try {
            if (!ReactEcharts)
                ReactEcharts = (await import("echarts-for-react")).default;
            await this.initChartData();
        } catch (e) {
            if (!this.isCancelled) {
                this.setState(
                    this.getResetState({
                        error: e
                    })
                );

                gapi.event({
                    category: "Error",
                    action: `Failed to display chart for ${
                        window.location.href
                    }: ${e.message}`,
                    label: "Chart Display Failure",
                    nonInteraction: true
                });

                // if there is error, automatically switch to table view
                switchTabOnFirstGo(this.props);
            }
        }
    }

    async componentDidUpdate(prevProps, prevState) {
        try {
            if (
                ChartDatasetEncoder.isValidDistributionData(
                    this.props.distribution
                ) &&
                (prevProps.distribution.identifier !==
                    this.props.distribution.identifier ||
                    prevState.chartTitle !== this.state.chartTitle ||
                    prevState.chartType !== this.state.chartType ||
                    prevState.xAxis !== this.state.xAxis ||
                    prevState.yAxis !== this.state.yAxis) &&
                !this.isCancelled
            ) {
                this.setState(
                    this.getResetState({
                        isLoading: true
                    })
                );
                await this.initChartData();
            }
        } catch (e) {
            // we do not automatically switch to table view here because chart has already successfully rendered.
            // for subsequent error cause the chart to not render, we will just display an error message
            if (!this.isCancelled) {
                this.setState(
                    this.getResetState({
                        error: e
                    })
                );
            }
        }
    }

    componentWillUnmount() {
        this.isCancelled = true;
    }

    onChartConfigChanged(key, value) {
        this.setState({ [key]: value });
    }

    onToggleButtonClick(e) {
        e.preventDefault();
        this.setState({
            isExpanded: !this.state.isExpanded
        });
    }

    onDismissError() {
        // switch to table tab on dismiss error
        this.props.onChangeTab("table");
    }

    render() {
        if (this.state.error)
            return (
                <AUpageAlert as="error" className="notification__inner">
                    <h3>Oops</h3>
                    <p>Chart preview not available, please try table preview</p>
                    <button
                        onClick={this.onDismissError}
                        className="switch-tab-btn"
                    >
                        Switch to table preview
                    </button>
                </AUpageAlert>
            );
        if (this.state.isLoading) return <Spinner height="420px" />;
        if (!ReactEcharts)
            return <div>Unexpected Error: failed to load chart component.</div>;

        return (
            <div
                className="row data-preview-chart"
                ref={chartWidthDiv => {
                    this.chartWidthDiv = chartWidthDiv;
                }}
            >
                <div className="col-sm-8 chart-panel-container">
                    <h4 className="chart-title">{this.state.chartTitle}</h4>
                    <ReactEcharts
                        className="data-preview-chart-container"
                        style={{ height: "450px", color: "yellow" }}
                        lazyUpdate={true}
                        option={this.state.chartOption}
                        theme="au_dga"
                    />
                </div>
                <div className="col-sm-4 config-panel-container">
                    {this.state.isExpanded ? (
                        <ChartConfig
                            chartType={this.state.chartType}
                            chartTitle={this.state.chartTitle}
                            xAxis={this.state.xAxis}
                            yAxis={this.state.yAxis}
                            xAxisOptions={this.state.avlXCols}
                            yAxisOptions={this.state.avlYCols}
                            onChange={this.onChartConfigChanged}
                        />
                    ) : null}
                    <Small>
                        {this.state.isExpanded ? (
                            <button
                                className="toggle-button"
                                onClick={e => this.onToggleButtonClick(e)}
                            >
                                <span>Hide chart options</span>
                                <img src={upArrowIcon} alt="upArrowIcon" />
                            </button>
                        ) : (
                            <button
                                className="toggle-button"
                                onClick={e => this.onToggleButtonClick(e)}
                            >
                                <span>Show chart options</span>
                                <img src={downArrowIcon} alt="downArrow" />
                            </button>
                        )}
                    </Small>
                </div>
            </div>
        );
    }
}

export default DataPreviewChart;
