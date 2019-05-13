import React, { useState } from "react";
import "react-dates/initialize";
import "react-dates/lib/css/_datepicker.css";

import Styles from "Components/Editing/Editors/dateEditor.module.scss";

import { SingleDatePicker } from "react-dates";
import Moment from "moment";

function DatePicker({ date, callback }: { date: Date; callback: Function }) {
    const [focused, setFocused] = useState(false);

    const onDateChange = (moment: Moment.Moment | null) => {
        callback(moment && moment.toDate());
    };

    return (
        <span className={Styles.wrapper}>
            <SingleDatePicker
                date={Moment(date)}
                onDateChange={onDateChange}
                id={Math.random().toString()}
                focused={focused}
                onFocusChange={state => setFocused(!!state.focused)}
                isOutsideRange={() => false}
                displayFormat="DD/MM/YYYY"
                showClearDate
                noBorder
                small
                showDefaultInputIcon
            />
        </span>
    );
}

export const dateEditor = {
    edit: (value: Date, onChange: Function) => {
        return (
            // <input
            //     className="au-text-input"
            //     defaultValue={value as string}
            //     onChange={callback}
            //     {...options}
            // />
            <DatePicker callback={onChange} date={value} />
        );
    },
    view: (value: Date) => {
        return <React.Fragment>{value.toString()}</React.Fragment>;
    }
};
// export const dateIntervalEditor = {
//     edit: (value: any, onChange: Function) => {
//         value = Object.assign({}, value || {});

//         const change = field => newValue => {
//             value = Object.assign({}, value, { [field]: newValue });
//             onChange(value);
//         };
//         return (
//             <React.Fragment>
//                 {dateEditor.edit(value.start, change("start"))} -
//                 {dateEditor.edit(value.end, change("end"))}
//             </React.Fragment>
//         );
//     },
//     view: (value: any) => {
//         value = value || {};
//         let start = value.start || "unknown";
//         let end = value.end || "unknown";
//         return (
//             <React.Fragment>
//                 {start}-{end}
//             </React.Fragment>
//         );
//     }
// };

// export const multiDateIntervalEditor: Editor = ListMultiItemEditor.create(
//     dateIntervalEditor,
//     () => {
//         return {};
//     }
// );
