//@flow
import React from "react";
import { config } from "../config";
import ReactDocumentTitle from "react-document-title";
import AUpageAlert from "../pancake/react/page-alerts";

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
                <AUpageAlert as="error">
                    {this.props.error.title ? (
                        <h3>{this.props.error.title}</h3>
                    ) : null}
                    <p>{this.props.error.detail}</p>
                </AUpageAlert>
            </ReactDocumentTitle>
        );
    }
}
