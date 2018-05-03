import React from "react";
import ErrorHandler from "./ErrorHandler";

export default function RouteNotFound() {
    return <ErrorHandler error={{ title: 404, detail: "Not Found" }} />;
}
