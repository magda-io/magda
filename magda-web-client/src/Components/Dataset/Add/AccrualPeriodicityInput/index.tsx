import React, { FunctionComponent } from "react";
import ReactSelect from "react-select";
import CustomStyles from "./CustomStyles";
import { accrualPeriodicity } from "constants/DatasetConstants";
import { RRule, Options as RRuleOptions, Frequency, Weekday } from "rrule";
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
    byweekday: [RRule.MO] as Weekday[]
};

const AccrualPeriodicityInput: FunctionComponent<PropsType> = props => {
    const recurrenceRuleOptions = props.accrualPeriodicityRecurrenceRule
        ? RRule.parseString(props.accrualPeriodicityRecurrenceRule)
        : DEFAULT_CUSTOM_INPUT_VALUE;

    const onWeekDayClick = (
        recurrenceRuleOptions: Partial<RRuleOptions>,
        weekday: Weekday
    ) => {
        return () => {
            const selectedWeekDays: Weekday[] = Array.isArray(
                recurrenceRuleOptions.byweekday
            )
                ? (recurrenceRuleOptions.byweekday as Weekday[])
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
        weekday: Weekday
    ) => {
        const selectedWeekDays: Weekday[] = Array.isArray(
            recurrenceRuleOptions.byweekday
        )
            ? (recurrenceRuleOptions.byweekday as Weekday[])
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
                typeof props.onAccrualPeriodicityRecurrenceRuleChange ===
                "function"
            ) {
                if (value !== "custom") {
                    // --- reset custom Recurrence Rule input
                    props.onAccrualPeriodicityRecurrenceRuleChange("");
                } else {
                    const rruleStr = new RRule(
                        DEFAULT_CUSTOM_INPUT_VALUE
                    ).toString();
                    props.onAccrualPeriodicityRecurrenceRuleChange(rruleStr);
                }
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
            if (option.value !== RRule.WEEKLY) {
                delete newRecurrenceRuleOptions.byweekday;
            } else {
                newRecurrenceRuleOptions.byweekday =
                    DEFAULT_CUSTOM_INPUT_VALUE.byweekday;
            }
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
                    <div className="custom-recurrence-input-header clearfix">
                        <h1>Custom recurrence</h1>
                    </div>
                    <div className="custom-recurrence-input-body clearfix">
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
                                                    recurrenceRuleOptions.freq as Frequency
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
                            <div className="repeat-on-section clearfix">
                                <div className="repeat-on-heading">
                                    Repeat on
                                </div>
                                <div className="repeat-on-options">
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.SU
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.SU
                                        )}
                                    >
                                        S
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.MO
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.MO
                                        )}
                                    >
                                        M
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.TU
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.TU
                                        )}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.WE
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.WE
                                        )}
                                    >
                                        W
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.TH
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.TH
                                        )}
                                    >
                                        T
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.FR
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.FR
                                        )}
                                    >
                                        F
                                    </button>
                                    <button
                                        className={`repeat-on-option ${getWeekDayActiveClass(
                                            recurrenceRuleOptions,
                                            RRule.SA
                                        )}`}
                                        onClick={onWeekDayClick(
                                            recurrenceRuleOptions,
                                            RRule.SA
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
