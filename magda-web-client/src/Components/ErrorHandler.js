//@flow
import React from "react";
import { config } from "../config";
import ReactDocumentTitle from "react-document-title";

export default class ErrorHandler extends React.Component {
    props: {
        error: {
            title: string,
            detail: string
        }
    };

    render() {
        return (
            <ReactDocumentTitle title={"Error | " + config.appName}>
                <div className="container">
                    <h1>{this.props.error.title}</h1>
                    {this.props.error.detail}
                </div>
            </ReactDocumentTitle>
        );
    }
}
