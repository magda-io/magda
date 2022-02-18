import React from "react";
import Notification from "rsuite/Notification";
import { toaster } from "rsuite";

function reportError(msg: string) {
    toaster.push(
        <Notification type={"error"} closable={true} header="Error">
            {msg}
        </Notification>,
        {
            placement: "topEnd"
        }
    );
}

export default reportError;
