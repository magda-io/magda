import React, { Component } from "react";
import PropTypes from "prop-types";
import "./ChartConfig.css";
import Option from "muicss/lib/react/option";
import Select from "muicss/lib/react/select";
import Input from "muicss/lib/react/input";
import bar from "../assets/bar-chart.svg";
import circle from "../assets/circle-chart.svg";
import line from "../assets/line-chart.svg";
import point from "../assets/point-chart.svg";

const VEGAMARK = { bar, circle, line, point };
const DATATYPE = ["quantitative", "temporal", "ordinal", "nominal"];

export default class ChartConfig extends Component {
    renderDropdownSelect(options, id, label) {
        return (
            <Select
                name="input"
                label={label}
                defaultValue={this.props[id]}
                onChange={this.onChange.bind(this, id)}
            >
                {options.map(o => <Option key={o} value={o} label={o} />)}
            </Select>
        );
    }

    renderIconSelect(options, id, label) {
        return (
            <div className="mui-textfield chart-config_icon-select">
                <label tabIndex="-1">{label}</label>
                {Object.keys(options).map(v => (
                    <button
                        className={this.props.chartType === v ? "isActive" : ""}
                        onClick={this.props.onChange.bind(this, id, v)}
                        key={v}
                        title={v}
                    >
                        <img alt={v} src={VEGAMARK[v]} />
                    </button>
                ))}
            </div>
        );
    }

    onChange(id, evt) {
        this.props.onChange(id, evt.target.value);
    }

    render() {
        return (
            <div className="chart-config">
                <div className="chart-type">
                    {this.renderIconSelect(VEGAMARK, "chartType", "Chart type")}
                </div>
                <div className="chart-title">
                    <Input
                        onChange={this.onChange.bind(this, "chartTitle")}
                        label="Chart title"
                        placeholder="Enter a descriptive chart title"
                    />
                </div>
                <div className="y-axis">
                    {this.renderDropdownSelect(
                        this.props.xAxisOptions,
                        "xAxis",
                        "xAxis"
                    )}
                </div>
                <div className="x-axis">
                    {this.renderDropdownSelect(
                        this.props.yAxisOptions,
                        "yAxis",
                        "yAxis"
                    )}
                </div>
                <div className="linear">
                    {this.renderDropdownSelect(
                        DATATYPE,
                        "yScale",
                        "Chart scale"
                    )}
                </div>
            </div>
        );
    }
}

ChartConfig.propTypes = {
    chartTitle: PropTypes.string,
    chartType: PropTypes.oneOf(Object.keys(VEGAMARK)),
    onChange: PropTypes.func,
    xAxis: PropTypes.string,
    xAxisOptions: PropTypes.arrayOf(PropTypes.string),
    xScale: PropTypes.oneOf(DATATYPE),
    yAxis: PropTypes.string,
    yAxisOptions: PropTypes.arrayOf(PropTypes.string),
    yScale: PropTypes.oneOf(DATATYPE)
};
