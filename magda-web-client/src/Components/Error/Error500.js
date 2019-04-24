import React from "react";
import ErrorHandler from "./ErrorHandler";

export default function ErrorPage({ errorData }) {
    let errorMsg =
        "An internal server error has ocurred when tried to process your request.";
    if (errorData.reason) {
        errorMsg = `Internal server error: ${errorData.reason}`;
    }
    return (
        <ErrorHandler
            error={{
                title: "Server has failed to process your request:",
                detail: errorMsg
            }}
        />
    );
}
