import React from "react";
import MediaQuery from "react-responsive";
import { config } from "../config";

export function ExtraSmall(props) {
    return (
        <MediaQuery maxWidth={config.breakpoints.small}>
            {props.children}
        </MediaQuery>
    );
}

export function Small(props) {
    return (
        <MediaQuery maxWidth={config.breakpoints.medium - 1}>
            {props.children}
        </MediaQuery>
    );
}

export function Medium(props) {
    return (
        <MediaQuery minWidth={config.breakpoints.medium}>
            {props.children}
        </MediaQuery>
    );
}

export function Large(props) {
    return (
        <MediaQuery minWidth={config.breakpoints.large} component="div">
            {props.children}
        </MediaQuery>
    );
}
