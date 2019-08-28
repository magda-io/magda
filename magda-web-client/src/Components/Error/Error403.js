import React from "react";
import ErrorHandler from "./ErrorHandler";

export default function ErrorPage({ errorData }) {
    let errorMsg =
        "An authorisation error has occurred while to processing your request.";
    if (errorData.reason) {
        errorMsg = errorData.reason;
    }
    return (
        <ErrorHandler
            error={{
                title: "Authorisation error:",
                detail: errorMsg
            }}
        />
    );
}
