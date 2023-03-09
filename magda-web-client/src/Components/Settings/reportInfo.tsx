import React from "react";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";

function reportInfo(
    msg: string,
    opts: {
        type?: "info" | "success" | "error" | "warning";
        header?: string;
        duration?: number;
    } = {}
) {
    toaster.push(
        <Notification type="info" closable={true} header="Notice" {...opts}>
            {`${msg}`}
        </Notification>,
        {
            placement: "topEnd"
        }
    );
}

export default reportInfo;
