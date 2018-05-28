import "./FacetTemporal.css";
import React, { Component } from "react";
import FacetHeader from "./FacetHeader";
import defined from "../../helpers/defined";
import MonthPicker from "../../UI/MonthPicker";
import range from "../../assets/range.svg";

// the date range facet facet, extends facet component
class FacetTemporal extends Component {
    constructor(props) {
        super(props);
        this.onClearDates = this.onClearDates.bind(this);
        this.onApplyFilter = this.onApplyFilter.bind(this);
        this.selectStartYear = this.selectStartYear.bind(this);
        this.selectEndYear = this.selectEndYear.bind(this);
        this.selectStartMonth = this.selectStartMonth.bind(this);
        this.selectEndMonth = this.selectEndMonth.bind(this);
        this.toggleDisableApplyButton = this.toggleDisableApplyButton.bind(
            this
        );
        this.state = {
            startYear: undefined,
            startMonth: undefined,
            endYear: undefined,
            endMonth: undefined,
            applyButtonDisabled: true
        };
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.temporalRange) {
            const dateFrom = defined(nextProps.activeDates[0])
                ? new Date(nextProps.activeDates[0])
                : new Date(nextProps.temporalRange[0]);
            const dateTo = defined(nextProps.activeDates[1])
                ? new Date(nextProps.activeDates[1])
                : new Date(nextProps.temporalRange[1]);
            this.setState({
                startYear: dateFrom.getUTCFullYear(),
                startMonth: dateFrom.getUTCMonth(),
                endYear: dateTo.getUTCFullYear(),
                endMonth: dateTo.getUTCMonth(),
                applyButtonDisabled: !this.props.hasQuery
            });
        }
    }

    onClearDates() {
        let datesArray = [undefined, undefined];
        this.props.onToggleOption(datesArray);
    }

    onApplyFilter() {
        // the month we get are 0 index, to convert to date string, we need to offset by 1
        const dateFrom = new Date(
            this.state.startYear,
            this.state.startMonth + 1
        );
        const dateTo = new Date(this.state.endYear, this.state.endMonth + 1);
        this.props.onToggleOption([
            dateFrom.toISOString(),
            dateTo.toISOString()
        ]);
    }

    selectStartYear(startYear) {
        this.setState({
            startYear
        });
        this.toggleDisableApplyButton(false);
    }

    selectEndYear(endYear) {
        this.setState({
            endYear
        });
        this.toggleDisableApplyButton(false);
    }

    selectStartMonth(startMonth) {
        this.setState({
            startMonth
        });
        this.toggleDisableApplyButton(false);
    }

    selectEndMonth(endMonth) {
        this.setState({
            endMonth
        });
        this.toggleDisableApplyButton(false);
    }

    toggleDisableApplyButton(disabled) {
        this.setState({
            applyButtonDisabled: disabled
        });
    }

    renderDatePicker() {
        const temporalRangeStart = new Date(this.props.temporalRange[0]);
        const temporalRangeEnd = new Date(this.props.temporalRange[1]);

        const yearLower = temporalRangeStart.getUTCFullYear();
        const monthLower = temporalRangeStart.getUTCMonth();

        const yearUpper = temporalRangeEnd.getUTCFullYear();
        const monthUpper = temporalRangeEnd.getUTCMonth();

        return (
            <div className="facet-temporal-month-picker">
                <MonthPicker
                    onInvalidInput={this.toggleDisableApplyButton}
                    showingDefault={!this.props.hasQuery}
                    year={this.state.startYear}
                    month={this.state.startMonth}
                    yearLower={yearLower}
                    yearUpper={this.state.endYear}
                    monthLower={monthLower}
                    monthUpper={this.state.endMonth}
                    selectYear={this.selectStartYear}
                    selectMonth={this.selectStartMonth}
                    startDate={true}
                />
                <div className="facet-temporal-range-icon">
                    <img src={range} alt="date range" />
                </div>
                <MonthPicker
                    onInvalidInput={this.toggleDisableApplyButton}
                    showingDefault={!this.props.hasQuery}
                    year={this.state.endYear}
                    month={this.state.endMonth}
                    yearLower={this.state.startYear}
                    yearUpper={yearUpper}
                    monthLower={this.state.startMonth}
                    monthUpper={monthUpper}
                    selectYear={this.selectEndYear}
                    selectMonth={this.selectEndMonth}
                    startDate={false}
                />
            </div>
        );
    }

    render() {
        if (this.props.temporalRange) {
            return (
                <div className="facet-wrapper">
                    <FacetHeader
                        onResetFacet={this.props.onResetFacet}
                        title={this.props.title}
                        id={this.props.id}
                        activeOptions={this.props.activeDates}
                        hasQuery={this.props.hasQuery}
                        onClick={this.props.toggleFacet}
                        isOpen={this.props.isOpen}
                    />
                    {this.props.isOpen && (
                        <div className="clearfix facet-temporal facet-body">
                            {this.renderDatePicker()}
                            <div className="facet-footer">
                                <button
                                    className="au-btn au-btn--secondary"
                                    disabled={this.state.applyButtonDisabled}
                                    onClick={this.props.onResetFacet}
                                >
                                    {" "}
                                    Clear{" "}
                                </button>
                                <button
                                    className="au-btn au-btn--primary"
                                    disabled={this.state.applyButtonDisabled}
                                    onClick={this.onApplyFilter}
                                >
                                    {" "}
                                    Apply{" "}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    }
}

export default FacetTemporal;
