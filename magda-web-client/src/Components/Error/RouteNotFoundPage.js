import React from "react";
import ErrorHandler from "Components/Error/ErrorHandler";

export default function RouteNotFound() {
    return <ErrorHandler error={{ title: 404, detail: "Not Found" }} />;
}
