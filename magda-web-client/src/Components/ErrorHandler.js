//@flow
import React from "react";
import { connect } from "react-redux";
import MagdaDocumentTitle from "./Meta/MagdaDocumentTitle";
import AUpageAlert from "../pancake/react/page-alerts";

class ErrorHandler extends React.Component {
    props: {
        error: {
            title: string,
            detail: string
        }
    };

    render() {
        return (
            <MagdaDocumentTitle prefixes={["Error"]}>
                <AUpageAlert as="error">
                    {this.props.error.title ? (
                        <h3>{this.props.error.title}</h3>
                    ) : null}
                    <p>{this.props.error.detail}</p>
                </AUpageAlert>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    return {
        strings: state.content.strings
    };
}

export default connect(
    mapStateToProps,
    null
)(ErrorHandler);
