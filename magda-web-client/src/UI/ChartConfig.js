import React, { Component } from "react";
import PropTypes from "prop-types";
import "./ChartConfig.css";
import Option from "muicss/lib/react/option";
import Select from "muicss/lib/react/select";
import Input from "muicss/lib/react/input";
import bar from "../assets/bar-chart.svg";
import pie from "../assets/circle-chart.svg";
import line from "../assets/line-chart.svg";
import scatter from "../assets/point-chart.svg";
import ChartDatasetEncoder from "../helpers/ChartDatasetEncoder";
import findIndex from "lodash/findIndex";

const chartIcons = {
    bar,
    pie,
    line,
    scatter
};

export default class ChartConfig extends Component {
    renderDropdownSelect(options, id, label) {
        return (
            <Select
                name="input"
                label={label}
                value={findIndex(options,item =>item === this.props[id])}
                onChange={e => {
                    const idx = e.target.value;
                    this.onChange(id, options[idx]);
                }}
            >
                {options
                    ? options.map(
                          (o,idx) =>
                              typeof o === "string" ? (
                                  <Option key={o} value={o} label={o} />
                              ) : (
                                  <Option
                                      key={idx}
                                      value={idx}
                                      label={o.label}
                                  />
                              )
                      )
                    : null}
            </Select>
        );
    }

    renderIconSelect() {
        return (
            <div className="mui-textfield chart-config_icon-select">
                <label tabIndex="-1">Chart type</label>
                {ChartDatasetEncoder.avlChartTypes.map(v => (
                    <button
                        className={this.props.chartType === v ? "isActive" : ""}
                        onClick={e => this.onChange("chartType", v)}
                        key={v}
                        title={v}
                    >
                        <img alt={v} src={chartIcons[v]} />
                    </button>
                ))}
            </div>
        );
    }

    onChange(id, value) {
        this.props.onChange(id, value);
    }

    render() {
        return (
            <div className="chart-config">
                <div className="chart-type">{this.renderIconSelect()}</div>
                <div className="chart-title">
                    <Input
                        onChange={e =>
                            this.onChange("chartTitle", e.target.value)
                        }
                        label="Chart title"
                        placeholder="Enter a descriptive chart title"
                        value={this.props.chartTitle}
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
            </div>
        );
    }
}

ChartConfig.propTypes = {
    chartTitle: PropTypes.string,
    chartType: PropTypes.oneOf(ChartDatasetEncoder.avlChartTypes),
    onChange: PropTypes.func,
    xAxis: PropTypes.object,
    xAxisOptions: PropTypes.arrayOf(PropTypes.object),
    yAxis: PropTypes.object,
    yAxisOptions: PropTypes.arrayOf(PropTypes.object)
};
