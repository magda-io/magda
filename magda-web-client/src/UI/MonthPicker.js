import React, { Component } from "react";
import PropTypes from "prop-types";
import debounce from "lodash.debounce";
import "./MonthPicker.css";
import help from "../assets/help.svg";
import defined from "../helpers/defined";
import ReactTooltip from "react-tooltip";

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
            yearValue: undefined,
            isDefault: false
        };
    }

    componentDidMount() {
        this.setState({
            // whether the current year is default or by user selection
            // if it's by default, we want to show it slightly opaque
            // to invite user to edit
            isDefault: this.props.showingDefault
        });
    }

    changeYear(value) {
        if (!this.checkYearValid(value)) {
            this.setState({
                prompt: `Enter a year between ${this.props.yearLower}-${
                    this.props.yearUpper
                }`
            });
            //this.props.onInvalidInput(true);
        } else {
            this.props.selectYear(+value);
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
            const yearValue = event.target.value;
            this.setState({
                yearValue: yearValue
            });

            this.debounceValidateYearField(yearValue);
        }
    }

    onFocus() {
        this.setState({
            prompt: ""
        });
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
        // return (
        //     <span className="month-picker-prompt">
        //         Please enter a year from s1000 to 2019
        //     </span>
        // );
    }

    checkYearValid(year) {
        if (
            !year ||
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

    /**
     * This function renders the ? tooltip next to the right hand side date picker
     * based on whether or not a future date is selected
     */
    renderToolTip = () => {
        var date = new Date();
        var currYear = date.getFullYear();
        var currMonth = date.getMonth() + 1;
        var upperYear = this.props.year;
        var upperMonth = this.props.month + 1;
        if (
            upperYear > currYear ||
            (upperYear === currYear && upperMonth > currMonth)
        ) {
            return (
                <span className="help-icon-position">
                    <img
                        src={help}
                        alt="Help Link"
                        data-tip={"Some datasets are predictions"}
                        data-place="top"
                        data-html={true}
                        data-class="future-date-tooltip"
                    />
                    <ReactTooltip type="dark" />
                </span>
            );
        }
    };

    getYearValue() {
        const propYear = isNaN(this.props.year) ? "" : this.props.year;
        return defined(this.state.yearValue) ? this.state.yearValue : propYear;
    }

    render() {
        const monthIndex = (i, j) => i * MONTH_NAMES[0].length + j;
        const yearValue = this.getYearValue();
        return (
            <table className="month-picker">
                <tbody>
                    <tr>
                        <th colSpan="3">
                            <div className={"year-input-container"}>
                                <input
                                    type="year"
                                    placeholder="select a year"
                                    onChange={this.onChange}
                                    onFocus={this.onFocus}
                                    onBlur={this.onBlur}
                                    value={yearValue}
                                    className={`au-text-input au-text-input--block ${
                                        this.state.isDefault ? "is-default" : ""
                                    }`}
                                />
                                {!this.props.startDate && this.renderToolTip()}
                                {this.renderPrompt()}
                            </div>
                        </th>
                    </tr>
                    {MONTH_NAMES.map((m, i) => (
                        <tr key={m}>
                            {m.map((n, j) => (
                                <td key={n}>
                                    <button
                                        disabled={
                                            !this.checkMonthValid(
                                                yearValue,
                                                monthIndex(i, j)
                                            )
                                        }
                                        onClick={this.props.selectMonth.bind(
                                            this,
                                            monthIndex(i, j)
                                        )}
                                        className={`au-btn btn-facet-option btn-month ${
                                            this.props.month ===
                                                monthIndex(i, j) &&
                                            this.checkMonthValid(
                                                yearValue,
                                                monthIndex(i, j)
                                            )
                                                ? "is-active"
                                                : ""
                                        }`}
                                    >
                                        {n}
                                    </button>
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
