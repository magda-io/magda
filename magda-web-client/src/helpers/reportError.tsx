import React from "react";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";

function reportError(
    msg: string | Error | unknown,
    opts: {
        header?: string;
        duration?: number;
    } = {}
) {
    toaster.push(
        <Notification type={"error"} closable={true} header="Error" {...opts}>
            {`${msg}`}
        </Notification>,
        {
            placement: "topEnd"
        }
    );
}

export default reportError;
