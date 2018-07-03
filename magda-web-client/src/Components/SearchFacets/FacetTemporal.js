import "./FacetTemporal.css";
import React, { Component } from "react";
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

        if (this.props.temporalRange) {
            const dateFrom = defined(this.props.activeDates[0])
                ? new Date(this.props.activeDates[0])
                : new Date(this.props.temporalRange[0]);
            const dateTo = defined(this.props.activeDates[1])
                ? new Date(this.props.activeDates[1])
                : new Date(this.props.temporalRange[1]);
            this.state = {
                startYear: dateFrom.getUTCFullYear(),
                startMonth: dateFrom.getUTCMonth(),
                endYear: dateTo.getUTCFullYear(),
                endMonth: dateTo.getUTCMonth()
            };
        } else {
            this.state = {
                startYear: defined(this.props.activeDates[0])
                    ? new Date(this.props.activeDates[0])
                    : undefined,
                startMonth: undefined,
                endYear: undefined,
                endMonth: undefined
            };
        }
    }

    /**
     * only apply filter if the year is defined/selected
     * in the case that temporalWrapper is open, if the FacetHeader 'x' buttton
     * is clicked, it calls the ToggleReset, which calls the closeFacet() method,
     * which in turns applies the selected dates. So we need to see if the 'x' has
     * been clicked in the facetHeader. If it has, then don't applyFilter.
     */
    componentWillUnmount() {
        if (this.canApply() && !this.props.disableApply) {
            this.onApplyFilter();
        }
        this.props.toggleDateReset();
    }

    canApply() {
        const dateFrom = new Date(this.props.temporalRange[0]);
        const dateTo = new Date(this.props.temporalRange[1]);
        return (
            defined(this.state.startYear) &&
            defined(this.state.startMonth) &&
            defined(this.state.endMonth) &&
            defined(this.state.endYear) &&
            (this.state.startYear !== dateFrom.getUTCFullYear() ||
                this.state.startMonth !== dateFrom.getUTCMonth() ||
                this.state.endYear !== dateTo.getUTCFullYear() ||
                this.state.endMonth !== dateTo.getUTCMonth())
        );
    }

    /**
     * Makes sure that when clear button is called,
     * start year and end years are reset.
     */
    resetTemporalFacet = () => {
        this.setState(
            () => {
                return {
                    startYear: undefined,
                    startMonth: undefined,
                    endYear: undefined,
                    endMonth: undefined
                };
            },
            //make sure the dates are cleared
            // before calling reset and close
            () => {
                this.props.onResetFacet();
            }
        );
    };

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
    }

    selectEndYear(endYear) {
        this.setState({
            endYear
        });
    }

    selectStartMonth(startMonth) {
        this.setState({
            startMonth
        });
    }

    selectEndMonth(endMonth) {
        this.setState({
            endMonth
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
        return (
            <div>
                <div className="clearfix facet-temporal facet-body">
                    {this.renderDatePicker()}
                    <div className="facet-footer">
                        <button
                            className="au-btn au-btn--secondary"
                            disabled={!this.canApply()}
                            onClick={this.resetTemporalFacet}
                        >
                            {" "}
                            Clear{" "}
                        </button>
                        <button
                            className="au-btn au-btn--primary"
                            disabled={!this.canApply()}
                            onClick={this.onApplyFilter}
                        >
                            {" "}
                            Apply{" "}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default FacetTemporal;
