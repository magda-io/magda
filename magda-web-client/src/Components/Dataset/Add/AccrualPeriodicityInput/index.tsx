import React, { FunctionComponent } from "react";
import ReactSelect from "react-select";
import CustomStyles from "./CustomStyles";
import { accrualPeriodicity } from "constants/DatasetConstants";
import { RRule, Options as RRuleOptions, WeekdayStr } from "rrule";
import "./index.scss";

interface PropsType {
    onAccrualPeriodicityChange?: (accrualPeriodicity: string) => void;
    onAccrualPeriodicityRecurrenceRuleChange?: (
        accrualPeriodicityRecurrenceRule: string
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

const DEFAULT_CUSTOM_INPUT_VALUE = {
    interval: 1,
    freq: RRule.WEEKLY,
    byweekday: ["MO"] as WeekdayStr[]
};

const AccrualPeriodicityInput: FunctionComponent<PropsType> = props => {
    debugger;
    const recurrenceRuleOptions = props.accrualPeriodicityRecurrenceRule
        ? RRule.parseString(props.accrualPeriodicityRecurrenceRule)
        : DEFAULT_CUSTOM_INPUT_VALUE;

    const onWeekDayClick = (
        recurrenceRuleOptions: Partial<RRuleOptions>,
        weekday: WeekdayStr
    ) => {
        return () => {
            const selectedWeekDays: WeekdayStr[] = Array.isArray(
                recurrenceRuleOptions.byweekday
            )
                ? (recurrenceRuleOptions.byweekday as WeekdayStr[])
                : [];
            const idx = selectedWeekDays.indexOf(weekday);

            const newSelectedWeekDays =
                idx === -1
                    ? [...selectedWeekDays, weekday]
                    : selectedWeekDays.filter(item => item !== weekday);

            const newRecurrenceRuleOptions = {
                ...recurrenceRuleOptions,
                byweekday: newSelectedWeekDays
            };

            const rruleStr = new RRule(newRecurrenceRuleOptions).toString();

            if (
                typeof props.onAccrualPeriodicityRecurrenceRuleChange ===
                "function"
            ) {
                props.onAccrualPeriodicityRecurrenceRuleChange(rruleStr);
            }
        };
    };

    const getWeekDayActiveClass = (
        recurrenceRuleOptions: Partial<RRuleOptions>,
        weekday: WeekdayStr
    ) => {
        const selectedWeekDays: WeekdayStr[] = Array.isArray(
            recurrenceRuleOptions.byweekday
        )
            ? (recurrenceRuleOptions.byweekday as WeekdayStr[])
            : [];
        const idx = selectedWeekDays.indexOf(weekday);
        if (idx === -1) return "";
        return "active";
    };

    const onAccrualPeriodicitySelectChange = (
        recurrenceRuleOptions: Partial<RRuleOptions>
    ) => {
        return option => {
            const value = option.value;
            if (typeof props.onAccrualPeriodicityChange === "function") {
                props.onAccrualPeriodicityChange(value);
            }

            if (
                value !== "custom" &&
                typeof props.accrualPeriodicityRecurrenceRule === "function"
            ) {
                // --- reset custom Recurrence Rule input
                props.onAccrualPeriodicityRecurrenceRuleChange("");
            }
        };
    };

    const onRepeatInputChange = (
        recurrenceRuleOptions: Partial<RRuleOptions>
    ) => {
        return event => {
            if (
                typeof props.onAccrualPeriodicityRecurrenceRuleChange !==
                "function"
            )
                return;
            let interval = DEFAULT_CUSTOM_INPUT_VALUE.interval;
            try {
                const number = parseInt(event.currentTarget.value);
                if (!isNaN(number)) interval = number;
            } catch (e) {}

            const newRecurrenceRuleOptions: Partial<RRuleOptions> = {
                ...recurrenceRuleOptions,
                interval
            };
            const rruleStr = new RRule(newRecurrenceRuleOptions).toString();
            props.onAccrualPeriodicityRecurrenceRuleChange(rruleStr);
        };
    };

    const onRepeatSelectChange = (
        recurrenceRuleOptions: Partial<RRuleOptions>
    ) => {
        return option => {
            if (
                typeof props.onAccrualPeriodicityRecurrenceRuleChange !==
                "function"
            )
                return;
            const newRecurrenceRuleOptions: Partial<RRuleOptions> = {
                ...recurrenceRuleOptions,
                freq: option.value
            };
            const rruleStr = new RRule(newRecurrenceRuleOptions).toString();
            props.onAccrualPeriodicityRecurrenceRuleChange(rruleStr);
        };
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
                    props.accrualPeriodicity
                        ? {
                              label:
                                  accrualPeriodicity[props.accrualPeriodicity],
                              value: props.accrualPeriodicity
                          }
                        : null
                }
                onChange={onAccrualPeriodicitySelectChange(
                    recurrenceRuleOptions
                )}
            />
            {props.accrualPeriodicity === "custom" ? (
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
                                value={recurrenceRuleOptions.interval}
                                onChange={onRepeatInputChange(
                                    recurrenceRuleOptions
                                )}
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
                                                    recurrenceRuleOptions.freq
                                                )
                                            ].label,
                                        value: recurrenceRuleOptions.freq
                                    } as any
                                }
                                onChange={onRepeatSelectChange(
                                    recurrenceRuleOptions
                                )}
                                styles={{
                                    control: provided => ({
                                        ...provided,
                                        width: "120px"
                                    })
                                }}
                            />
                        </div>
                        {recurrenceRuleOptions.freq === RRule.WEEKLY ? (
                            <div className="repeat-on-section">
                                <div className="repeat-on-heading">
                                    Repeat on
                                </div>
                                <div className="repeat-on-options">
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "SU"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "SU"
                                        )}
                                    >
                                        S
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "MO"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "MO"
                                        )}
                                    >
                                        M
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "TU"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "TU"
                                        )}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "WE"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "WE"
                                        )}
                                    >
                                        W
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "TH"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "TH"
                                        )}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "FR"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "FR"
                                        )}
                                    >
                                        F
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            "SA"
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            "SA"
                                        )}
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
