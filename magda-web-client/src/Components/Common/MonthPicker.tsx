import React, { useState } from "react";
import "./MonthPicker.scss";
import moment from "moment";

const MONTH_NAMES = [
    ["Jan", "Feb", "Mar"],
    ["Apr", "May", "Jun"],
    ["Jul", "Aug", "Sep"],
    ["Oct", "Nov", "Dec"]
];

type Props = {
    year?: number;
    month?: number;
    placeholder?: string;
    onChange: (year?: number, month?: number) => void;
    validationError?: string;
};

const checkYearValid = year => {
    if (!year) {
        return false;
    }
    // by the way,
    // moment(undefined).isValid() === true
    if (!moment(year, "Y").isValid()) {
        return false;
    }
    return true;
};

export function MonthPicker(props: Props) {
    const [yearValid, setYearValid] = useState(
        props.year === null || checkYearValid(props.year)
    );

    const onMonthChange = (month: number) => {
        props.onChange(props.year, month);
    };

    const onYearChange = (year: string) => {
        if (checkYearValid(year)) {
            setYearValid(true);
            props.onChange(Number.parseInt(year), props.month);
        } else {
            setYearValid(false);
        }
    };

    const monthIndex = (i, j) => i * MONTH_NAMES[0].length + j;
    return (
        <table className="month-picker">
            <tbody>
                <tr>
                    <th colSpan={3}>
                        <div className={"year-input-container"}>
                            <input
                                type="year"
                                placeholder={props.placeholder}
                                onChange={event =>
                                    onYearChange(event.target.value)
                                }
                                value={props.year || ""}
                                className="au-text-input au-text-input--block"
                            />
                            {!yearValid && (
                                <span className="month-picker-prompt">
                                    Error
                                </span>
                            )}
                        </div>
                    </th>
                </tr>
                {MONTH_NAMES.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                        {row.map((monthAbbr, columnIndex) => (
                            <td key={monthAbbr}>
                                <button
                                    onClick={() =>
                                        onMonthChange(
                                            monthIndex(rowIndex, columnIndex)
                                        )
                                    }
                                    className={`au-btn btn-facet-option btn-month ${
                                        props.month ===
                                        monthIndex(rowIndex, columnIndex)
                                            ? "is-active"
                                            : ""
                                    }`}
                                >
                                    {monthAbbr}
                                </button>
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default MonthPicker;
