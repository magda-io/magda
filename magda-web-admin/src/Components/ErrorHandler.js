//@flow
import React from "react";
import { config } from "../config.js";
import ReactDocumentTitle from "react-document-title";

export default class ErrorHandler extends React.Component {
    props: {
        errorCode: ?number
    };
    interpretateErrorCode(code: ?number) {
        switch (code) {
            case 404:
                return "record not found";
            default:
                return "Error occured";
        }
    }
    render() {
        return (
            <ReactDocumentTitle title={"Error | " + config.appName}>
                <div className="container">
                    <h1>{this.props.errorCode}</h1>
                    {this.interpretateErrorCode(this.props.errorCode)}
                </div>
            </ReactDocumentTitle>
        );
    }
}
