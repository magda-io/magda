import React from "react";

import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";

function reportError(e: Error | string) {
    toaster.push(
        <Notification
            type={"error"}
            closable={true}
            header="Error"
        >{`${e}`}</Notification>,
        {
            placement: "topEnd"
        }
    );
}

export default reportError;
