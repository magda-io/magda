import React from "react";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";

function reportWarn(
    msg: string | Error | unknown,
    opts: {
        header?: string;
        duration?: number;
    } = {}
) {
    toaster.push(
        <Notification
            type={"warning"}
            closable={true}
            header="Warning"
            {...opts}
        >
            {`${msg}`}
        </Notification>,
        {
            placement: "topEnd"
        }
    );
}

export default reportWarn;
