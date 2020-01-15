import "./FacetTemporal.scss";
import React, { useState } from "react";

import MonthPicker from "Components/Common/MonthPicker";
import range from "assets/range.svg";

interface Props {
    startYear?: number;
    startMonth?: number;
    endYear?: number;
    endMonth?: number;
    onApply: (
        startYear?: number,
        startMonth?: number,
        endYear?: number,
        endMonth?: number
    ) => void;
    earliestDate?: Date;
    latestDate?: Date;
}

function FacetTemporal(props: Props) {
    const [error, setError] = useState<string | undefined>(undefined);
    const [startYear, setStartYear] = useState<number | undefined>(
        props.startYear
    );
    const [startMonth, setStartMonth] = useState<number | undefined>(
        props.startMonth
    );
    const [endYear, setEndYear] = useState<number | undefined>(props.endYear);
    const [endMonth, setEndMonth] = useState<number | undefined>(
        props.endMonth
    );
    /**
     * Makes sure that when clear button is called,
     * start year and end years are reset.
     */
    const resetTemporalFacet = () => {
        setStartYear(undefined),
            setStartMonth(undefined),
            setEndYear(undefined),
            setEndMonth(undefined);

        props.onApply();
    };

    const onApplyFilter = () => {
        // the month we get are 0 index, to convert to date string, we need to offset by 1
        // const startDate = moment([startYear, startMonth, 1]).startOf("month")
        // const dateFrom = new Date(
        //     startYear,
        //     startMonth + 1
        // );
        // const dateTo = new Date(endYear, endMonth + 1);
        // this.props.onToggleOption([
        //     dateFrom.toISOString(),
        //     dateTo.toISOString()
        // ]);

        props.onApply(startYear, startMonth, endYear, endMonth);
    };

    const canClear = startMonth || startYear || endMonth || endYear;

    const canApply = (startMonth && startYear) || (endMonth && endYear);

    /**
     * Checks if end date is after start date
     */
    const checkStartAndEndDate = () => {
        const endYearBeforeStartYear =
            startYear && endYear && startYear > endYear;
        const startMonthBeforeEndMonth =
            startMonth &&
            endMonth &&
            startYear === endYear &&
            startMonth > endMonth;

        return !(endYearBeforeStartYear || startMonthBeforeEndMonth);
    };

    const onStartChange = (year?: number, month?: number) => {
        invalidStartEndDateWarning();

        setStartMonth(month);
        setStartYear(year);
    };

    const onEndChange = (year?: number, month?: number) => {
        invalidStartEndDateWarning();

        setEndMonth(month);
        setEndYear(year);
    };

    /**
     * Wrapper over checkStartAndEndDate that sets the prompt accordingly
     */
    const invalidStartEndDateWarning = () => {
        const startBeforeEnd = checkStartAndEndDate();
        if (!startBeforeEnd) {
            setError("End date is earlier than start date.");
        } else {
            setError(undefined);
        }
    };

    return (
        <div>
            <div className="clearfix facet-temporal facet-body">
                {error && <div className="facet-temporal-prompt">{error}</div>}

                <div className="facet-temporal-month-picker">
                    <MonthPicker
                        year={startYear}
                        month={startMonth}
                        onChange={onStartChange}
                        default={props.earliestDate}
                    />
                    <div className="facet-temporal-range-icon">
                        <img src={range} alt="date range" />
                    </div>
                    <MonthPicker
                        year={endYear}
                        month={endMonth}
                        onChange={onEndChange}
                        default={props.latestDate}
                    />
                </div>

                <div className="facet-footer">
                    <button
                        className="au-btn au-btn--secondary"
                        disabled={!canClear}
                        onClick={resetTemporalFacet}
                    >
                        {" "}
                        Clear{" "}
                    </button>
                    <button
                        className="au-btn au-btn--primary"
                        disabled={!canApply}
                        onClick={onApplyFilter}
                    >
                        {" "}
                        Apply{" "}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default FacetTemporal;
