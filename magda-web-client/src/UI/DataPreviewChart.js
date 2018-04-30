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
        this.state = {
            error : null,
            isLoading: true
        };
        this.chartDatasetEncoder = null;
    }

    async componentDidMount(){
        try{
            if(!ReactEcharts) ReactEcharts = (await import("echarts-for-react")).default;
            if(ChartDatasetEncoder.isValidDistributionData(this.props.distribution)){
                this.chartDatasetEncoder = new ChartDatasetEncoder(this.props.distribution);
                await this.chartDatasetEncoder.loadData();
            }
        }catch(e){
            this.setState({
                error: e
            })
        }
    }

    async componentDidUpdate(prevProps, prevState){
        if(
            ChartDatasetEncoder.isValidDistributionData(this.props.distribution) &&
            prevProps.distribution.identifier !== this.props.distribution.identifier
        ){
            this.chartDatasetEncoder = new ChartDatasetEncoder(this.props.distribution);
            await this.chartDatasetEncoder.loadData();
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
        if(!ReactEcharts) return null;
        return <ReactEcharts option={this.getOption()}  />;
    }
}


export default DataPreviewChart;