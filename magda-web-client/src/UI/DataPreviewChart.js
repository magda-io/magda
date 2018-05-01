import React, { Component } from "react";
import { config } from "../config";
import defined from "../helpers/defined";
import { Medium } from "./Responsive";
import Spinner from "../Components/Spinner";
import ChartDatasetEncoder from "../helpers/ChartDatasetEncoder";

let ReactEcharts = null;

class DataPreviewChart extends Component {
    constructor(props) {
        super(props);
        this.state = this.getResetState({
            isLoading: true
        });
        this.chartDatasetEncoder = null;
    }

    getResetState(extraOptions=null){
        const options = {
            error : null,
            isLoading: false,
            avlXCols: [],
            avlYCols: [],
            xAxis: null,
            yAxis: null,
            chartType: null,
            chartOption: null
        };
        if(!extraOptions) return options;
        else return {...options, ...extraOptions}
    }

    async initChartData(){
        try{
            if(ChartDatasetEncoder.isValidDistributionData(this.props.distribution)){
                this.chartDatasetEncoder = new ChartDatasetEncoder(this.props.distribution);
                await this.chartDatasetEncoder.loadData(this.props.distribution.downloadURL);
                this.chartDatasetEncoder.setDefaultParameters();
                const chartOption = this.chartDatasetEncoder.getChartOption(this.props.distribution.title);
                this.setState({
                    error: null,
                    isLoading: false,
                    avlXCols: this.chartDatasetEncoder.getAvailableXCols(),
                    avlYCols: this.chartDatasetEncoder.getAvailableYCols(),
                    xAxis: this.chartDatasetEncoder.xAxis,
                    yAxis: this.chartDatasetEncoder.yAxis,
                    chartOption
                });
            }
        }catch(e){
            console.log(e);
            throw e; //--- not capture here; only for debug
        }
    }

    async componentDidMount(){
        try{
            if(!ReactEcharts) ReactEcharts = (await import("echarts-for-react")).default;
            await this.initChartData();
        }catch(e){
            console.log(this.getResetState({
                error: e
            }));
            this.setState(this.getResetState({
                error: e
            }));
        }
    }

    async componentDidUpdate(prevProps, prevState){
        try{
            if(
                ChartDatasetEncoder.isValidDistributionData(this.props.distribution) &&
                prevProps.distribution.identifier !== this.props.distribution.identifier
            ){
                this.setState(this.getResetState({
                    isLoading: true
                }));
                await this.initChartData();
            }
        }catch(e){
            console.log(this.getResetState({
                error: e
            }));
            this.setState(this.getResetState({
                error: e
            }));
        }
    }

    getOption() {
        return  {
            title: {
                text: "test"
            },
            tooltip:{
                show:true
            },
            dataset: {
                source: [
                    ["product", "count", "score"],
                    ["Matcha Latte", 823, 95.8],
                    ["Milk Tea", 235, 81.4],
                    ["Cheese Cocoa", 1042, 91.2],
                    ["Walnut Brownie", 988, 76.9]
                ],
                dimensions: [
                    {
                        name: "product",
                        type: "ordinal"
                    },
                    {
                        name: "count",
                        type: "number"
                    },
                    {
                        name: "score",
                        type: "number"
                    }
                ]
            },
            series: [
                {
                    type: "pie",
                    encode: {
                        itemName: 0,
                        value: 1,
                        tooltip: [2]
                    }
                }
            ]
        };
    }

    render() {
        if(this.state.error) return <div>Error: {this.state.error.message}</div>;
        if(this.state.isLoading) return <div>Loading...</div>;
        if(!ReactEcharts) return <div>Unexpected Error: failed to load chart component.</div>;
        console.log(this.state);
        return <ReactEcharts option={this.state.chartOption}  />;
    }
}


export default DataPreviewChart;