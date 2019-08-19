import React from "react";
import ErrorHandler from "./ErrorHandler";

export default function ErrorPage({ errorData }) {
    let errorMsg =
        "An authorisation error has ocurred when tried to process your request.";
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
