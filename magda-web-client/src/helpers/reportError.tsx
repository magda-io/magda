import React from "react";
import Notification from "rsuite/Notification";
import toaster from "rsuite/toaster";
import isNetworkError from "@magda/typescript-common/dist/isNetworkError.js";

function reportError(
    err: string | Error | unknown,
    opts: {
        header?: string;
        duration?: number;
    } = {}
) {
    const msg = isNetworkError(err)
        ? "Network error: the server could not be reached."
        : String(err);
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
