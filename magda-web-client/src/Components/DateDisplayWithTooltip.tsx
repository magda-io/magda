import React, { FunctionComponent } from "react";
import Whisper from "rsuite/Whisper";
import Popover from "rsuite/Popover";
import moment from "moment";

type PropsType = {
    dateValue?: Date;
};

const DateDisplayWithTooltip: FunctionComponent<PropsType> = (props) => {
    const { dateValue } = props;

    if (!dateValue) {
        return <>N/A</>;
    }

    const d = moment(dateValue);
    if (!d.isValid()) {
        return <>N/A</>;
    }

    const dateStr = d.format("DD/MM/YYYY");
    const fullStr = d.format("dddd, MMMM Do YYYY, h:mm:ss a");

    return (
        <Whisper
            placement="top"
            trigger="hover"
            speaker={<Popover>{fullStr}</Popover>}
        >
            <div>{dateStr}</div>
        </Whisper>
    );
};

export default DateDisplayWithTooltip;
