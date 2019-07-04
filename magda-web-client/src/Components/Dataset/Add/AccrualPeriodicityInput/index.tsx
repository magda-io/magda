import React, { FunctionComponent, useState } from "react";
import ReactSelect from "react-select";
import CustomStyles from "./CustomStyles";
import { accrualPeriodicity } from "constants/DatasetConstants";
import { RRule, Frequency, WeekdayStr } from "rrule";
import "./index.scss";

interface PropsType {
    onAccrualPeriodicityChange?: (AccrualPeriodicity: string) => void;
    onAccrualPeriodicityRecurrenceRule?: (
        AccrualPeriodicityRecurrenceRule: string
    ) => void;
    accrualPeriodicity?: string;
    accrualPeriodicityRecurrenceRule?: string;
}

const REPEAT_OPTIONS = [
    {
        label: "Year",
        value: RRule.YEARLY
    },
    {
        label: "Month",
        value: RRule.MONTHLY
    },
    {
        label: "Week",
        value: RRule.WEEKLY
    },
    {
        label: "Day",
        value: RRule.DAILY
    },
    {
        label: "Hour",
        value: RRule.HOURLY
    }
];

interface StateType {
    accrualPeriodicity: string;
    accrualPeriodicityRecurrenceRule: string;
    repeatInputValue: string;
    repeatSelectValue: Frequency;
    selectedWeekDays: WeekdayStr[];
}

const initialState: StateType = {
    accrualPeriodicity: "",
    accrualPeriodicityRecurrenceRule: "",
    repeatInputValue: "1",
    repeatSelectValue: RRule.WEEKLY,
    selectedWeekDays: ["MO"]
};

const AccrualPeriodicityInput: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState(initialState);
    const onWeekDayClick = (state: StateType, weekday: WeekdayStr) => {
        return () => {
            const idx = state.selectedWeekDays.indexOf(weekday);
            if (idx === -1) {
                setState({
                    ...state,
                    selectedWeekDays: [...state.selectedWeekDays, weekday]
                });
            } else {
                setState({
                    ...state,
                    selectedWeekDays: state.selectedWeekDays.filter(
                        item => item !== weekday
                    )
                });
            }
        };
    };
    const getWeekDayActiveClass = (state: StateType, weekday: WeekdayStr) => {
        const idx = state.selectedWeekDays.indexOf(weekday);
        if (idx === -1) return "";
        return "active";
    };
    return (
        <div className="accrual-periodicity-input-container clearfix">
            <ReactSelect
                className="accrual-periodicity-select"
                styles={CustomStyles}
                isSearchable={false}
                defaultMenuIsOpen={true}
                menuIsOpen={true}
                closeMenuOnSelect={false}
                options={
                    Object.keys(accrualPeriodicity).map(key => ({
                        label: accrualPeriodicity[key],
                        value: key
                    })) as any
                }
                value={
                    state.accrualPeriodicity
                        ? {
                              label:
                                  accrualPeriodicity[state.accrualPeriodicity],
                              value: state.accrualPeriodicity
                          }
                        : null
                }
                onChange={option => {
                    const value = option.value;
                    if (value !== "custom") {
                        // --- reset custom Recurrence Rule input
                        setState({
                            ...state,
                            accrualPeriodicity: option.value,
                            accrualPeriodicityRecurrenceRule:
                                initialState.accrualPeriodicityRecurrenceRule,
                            repeatInputValue: initialState.repeatInputValue,
                            repeatSelectValue: initialState.repeatSelectValue,
                            selectedWeekDays: [...initialState.selectedWeekDays]
                        });
                    } else {
                        setState({
                            ...state,
                            accrualPeriodicity: option.value
                        });
                    }
                }}
            />
            {state.accrualPeriodicity === "custom" ? (
                <div className="custom-recurrence-input">
                    <div className="custom-recurrence-input-header">
                        <h1>Custom recurrence</h1>
                    </div>
                    <div className="custom-recurrence-input-body">
                        <div className="repeat-row clearfix">
                            <div className="repeat-heading">Repeat every</div>
                            <input
                                className="repeat-input au-text-input"
                                type="number"
                                min={1}
                                value={state.repeatInputValue}
                                onChange={event => {
                                    setState({
                                        ...state,
                                        repeatInputValue:
                                            event.currentTarget.value
                                    });
                                }}
                            />
                            <ReactSelect
                                className="repeat-select"
                                isSearchable={false}
                                options={REPEAT_OPTIONS}
                                value={
                                    {
                                        label:
                                            REPEAT_OPTIONS[
                                                REPEAT_OPTIONS.map(
                                                    item => item.value
                                                ).indexOf(
                                                    state.repeatSelectValue
                                                )
                                            ].label,
                                        value: state.repeatSelectValue
                                    } as any
                                }
                                onChange={value => {
                                    setState({
                                        ...state,
                                        repeatSelectValue: value.value
                                    });
                                }}
                                styles={{
                                    control: provided => ({
                                        ...provided,
                                        width: "120px"
                                    })
                                }}
                            />
                        </div>
                        {state.repeatSelectValue === RRule.WEEKLY ? (
                            <div className="repeat-on-section">
                                <div className="repeat-on-heading">
                                    Repeat on
                                </div>
                                <div className="repeat-on-options">
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "SU"
                                        )}`}
                                        onClick={onWeekDayClick(state, "SU")}
                                    >
                                        S
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "MO"
                                        )}`}
                                        onClick={onWeekDayClick(state, "MO")}
                                    >
                                        M
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "TU"
                                        )}`}
                                        onClick={onWeekDayClick(state, "TU")}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "WE"
                                        )}`}
                                        onClick={onWeekDayClick(state, "WE")}
                                    >
                                        W
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "TH"
                                        )}`}
                                        onClick={onWeekDayClick(state, "TH")}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "FR"
                                        )}`}
                                        onClick={onWeekDayClick(state, "FR")}
                                    >
                                        F
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            state,
                                            "SA"
                                        )}`}
                                        onClick={onWeekDayClick(state, "SA")}
                                    >
                                        S
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default AccrualPeriodicityInput;
