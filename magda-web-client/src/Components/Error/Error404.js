import React from "react";
import ErrorHandler from "./ErrorHandler";

export default function ErrorPage({ errorData }) {
    let errorMsg = "An error has ocurred when tried to locate the resource.";
    if (errorData.url) {
        errorMsg = `System cannot locate the URL you tried to access: ${errorData.url}`;
    } else if (errorData.recordType || errorData.recordId) {
        const msgParts = ["An error has ocurred when tried to locate"];
        if (errorData.recordType) {
            msgParts.push(`\`${errorData.recordType}\``);
        }
        if (errorData.recordId) {
            if (!errorData.recordType) {
                msgParts.push("the resource");
            }
            msgParts.push(`with token \`${errorData.recordId}\``);
        }
        errorMsg = msgParts.join(" ");
    }
    return (
        <ErrorHandler
            error={{
                title: "The resource you requested cannot be located:",
                detail: errorMsg
            }}
        />
    );
}
