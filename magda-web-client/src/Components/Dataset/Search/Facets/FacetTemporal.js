import "./FacetTemporal.scss";
import React, { Component } from "react";
import defined from "helpers/defined";
import MonthPicker from "Components/Common/MonthPicker";
import range from "assets/range.svg";

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
        this.resetTemporalFacet = this.resetTemporalFacet.bind(this);
        this.onFocus = this.onFocus.bind(this);
        this.setPrompt = this.setPrompt.bind(this);
        this.state = {
            startYear: undefined,
            startMonth: undefined,
            endYear: undefined,
            endMonth: undefined,
            prompt: ""
        };
    }

    static getDerivedStateFromProps(props, state) {
        // only copy props to state if state has not been set
        // basically beofre any manual UI change.
        // Once user starts changing UI, it reflects that changed state
        if (
            !state.startYear &&
            !state.endYear &&
            !state.startMonth &&
            !state.endMonth
        ) {
            if (props.temporalRange) {
                const dateFrom = defined(props.activeDates[0])
                    ? new Date(props.activeDates[0])
                    : new Date(props.temporalRange[0]);
                const dateTo = defined(props.activeDates[1])
                    ? new Date(props.activeDates[1])
                    : new Date(props.temporalRange[1]);
                return {
                    startYear: dateFrom.getUTCFullYear(),
                    startMonth: dateFrom.getUTCMonth(),
                    endYear: dateTo.getUTCFullYear(),
                    endMonth: dateTo.getUTCMonth()
                };
            } else {
                return {
                    startYear: defined(props.activeDates[0])
                        ? new Date(props.activeDates[0])
                        : undefined,
                    startMonth: undefined,
                    endYear: undefined,
                    endMonth: undefined,
                    prompt: ""
                };
            }
        }
        return null;
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
        // we need to check those values are not
        // null
        // undefined
        // NaN
        // month can be 0, while year cannot be 0
        return (
            this.state.startYear &&
            this.state.endYear &&
            defined(this.state.startMonth) &&
            !isNaN(this.state.startMonth) &&
            defined(this.state.endMonth) &&
            !isNaN(this.state.endMonth)
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
                    endMonth: undefined,
                    prompt: ""
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

    onFocus() {
        this.setState({
            prompt: ""
        });
    }

    selectStartYear(startYear) {
        const startBeforeEnd = this.checkStartAndEndDate();
        if (!startBeforeEnd) {
            this.setPrompt("End date is earlier than start date.");
        }
        this.setState({
            startYear
        });
    }

    selectEndYear(endYear) {
        const startBeforeEnd = this.checkStartAndEndDate();
        if (!startBeforeEnd) {
            this.setPrompt("End date is earlier than start date.");
        }
        this.setState({
            endYear
        });
    }

    selectStartMonth(startMonth) {
        const startBeforeEnd = this.checkStartAndEndDate();
        if (!startBeforeEnd) {
            this.setPrompt("End date is earlier than start date.");
        }
        this.setState({
            startMonth
        });
    }

    selectEndMonth(endMonth) {
        const startBeforeEnd = this.checkStartAndEndDate();
        if (!startBeforeEnd) {
            this.setPrompt("End date is earlier than start date.");
        }
        this.setState({
            endMonth
        });
    }

    setPrompt(prompt) {
        this.setState({
            prompt
        });
    }

    renderPrompt() {
        if (this.state.prompt.length > 0) {
            return (
                <span className="facet-temporal-prompt">
                    {this.state.prompt}
                </span>
            );
        }
        return null;
    }

    /**
     * Checks if end date is after start date
     */
    checkStartAndEndDate() {
        if (
            this.state.startYear > this.state.endYear ||
            (this.state.startYear === this.state.endYear &&
                this.state.startMonth > this.state.endMonth)
        ) {
            return false;
        }

        this.setPrompt("");
        return true;
    }

    renderDatePicker() {
        return (
            <div className="facet-temporal-month-picker">
                <MonthPicker
                    showingDefault={!this.props.hasQuery}
                    year={this.state.startYear}
                    month={this.state.startMonth}
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
                    {this.renderPrompt()}
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
