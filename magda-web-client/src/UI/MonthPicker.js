import React, { Component } from "react";
import Input from "muicss/lib/react/input";
import Button from "muicss/lib/react/button";
import PropTypes from "prop-types";
import debounce from "lodash.debounce";
import "./MonthPicker.css";

const MONTH_NAMES = [
    ["Jan", "Feb", "Mar"],
    ["Apr", "May", "Jun"],
    ["Jul", "Aug", "Sep"],
    ["Oct", "Nov", "Dec"]
];

class MonthPicker extends Component {
    constructor(props) {
        super(props);
        this.onChange = this.onChange.bind(this);
        this.debounceValidateYearField = debounce(this.changeYear, 1000);
        this.onFocus = this.onFocus.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.resetField = this.resetField.bind(this);
        this.state = {
            prompt: "",
            yearValue: "",
            isDefault: false
        };
    }

    componentWillMount() {
        this.setState({
            yearValue: this.props.year,
            // whether the current year is default or by user selection
            // if it's by default, we want to show it slightly opaque
            // to invite user to edit
            isDefault: this.props.showingDefault
        });
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.year !== this.props.year) {
            this.setState({
                yearValue: nextProps.year
            });
        }
    }

    changeYear(value) {
        if (!this.checkYearValid(value)) {
            this.setState({
                prompt: `Enter a year between ${this.props.yearLower}-${
                    this.props.yearUpper
                }`
            });
            this.props.onInvalidInput(true);
        } else {
            this.props.selectYear(value);
        }
    }

    onChange(event) {
        this.setState({
            isDefault: false,
            prompt: ""
        });

        if (event.target.value.length >= 5) {
            return false;
        } else {
            this.setState({
                yearValue: event.target.value
            });
            const value = +event.target.value;
            this.debounceValidateYearField(value);
        }
    }

    onFocus() {
        this.setState({
            yearValue: "",
            prompt: ""
        });
        // since input now is empty, we notify the parent
        this.props.onInvalidInput(true);
    }

    onBlur(event) {
        this.debounceValidateYearField.flush(event.target.value);
        this.resetField(event.target.value);
    }

    resetField(value) {
        // reset year and month to default value
        // reset prompt
        // flush field validation

        if (!this.checkYearValid(value)) {
            this.setState({
                yearValue: this.props.year,
                prompt: ""
            });
            this.props.selectYear(this.props.year);
            this.props.selectMonth(this.props.month);
        }
    }

    renderPrompt() {
        if (this.state.prompt.length > 0) {
            return (
                <span className="month-picker-prompt">{this.state.prompt}</span>
            );
        }
        return null;
    }

    checkYearValid(year) {
        if (
            isNaN(year) ||
            year < this.props.yearLower ||
            year > this.props.yearUpper
        ) {
            return false;
        }
        return true;
    }

    checkMonthValid(year, month) {
        const yearLower = this.props.yearLower;
        const yearUpper = this.props.yearUpper;
        const monthUpper = this.props.monthUpper;
        const monthLower = this.props.monthLower;
        if (!this.checkYearValid(year)) {
            return false;
        } else {
            if (year === yearLower) {
                if (month < monthLower) {
                    return false;
                }
                return true;
            } else if (year === yearUpper) {
                if (month > monthUpper) {
                    return false;
                }
                return true;
            }
            return true;
        }
    }

    render() {
        const monthIndex = (i, j) => i * MONTH_NAMES[0].length + j;
        return (
            <table className="month-picker mui-table">
                <tbody>
                    <tr>
                        <th colSpan="3">
                            <Input
                                type="year"
                                placeholder="select a year"
                                onChange={this.onChange}
                                onFocus={this.onFocus}
                                onBlur={this.onBlur}
                                value={this.state.yearValue}
                                className={`${
                                    this.state.isDefault ? "is-default" : ""
                                }`}
                            />
                            {this.renderPrompt()}
                        </th>
                    </tr>
                    {MONTH_NAMES.map((m, i) => (
                        <tr key={m}>
                            {m.map((n, j) => (
                                <td key={n}>
                                    <Button
                                        disabled={
                                            !this.checkMonthValid(
                                                +this.state.yearValue,
                                                monthIndex(i, j)
                                            )
                                        }
                                        onClick={this.props.selectMonth.bind(
                                            this,
                                            monthIndex(i, j)
                                        )}
                                        className={`btn-facet-option btn-month ${
                                            this.props.month ===
                                                monthIndex(i, j) &&
                                            this.checkMonthValid(
                                                +this.state.yearValue,
                                                monthIndex(i, j)
                                            )
                                                ? "is-active"
                                                : ""
                                        }`}
                                    >
                                        {n}
                                    </Button>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }
}

MonthPicker.propTypes = {
    year: PropTypes.number,
    month: PropTypes.number,
    yearUpper: PropTypes.number,
    yearLower: PropTypes.number,
    monthUpper: PropTypes.number,
    monthLower: PropTypes.number,
    selectMonth: PropTypes.func,
    selectYear: PropTypes.func,
    showingDefault: PropTypes.bool
};

export default MonthPicker;
