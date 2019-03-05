import React from "react";
import { connect } from "react-redux";
import MagdaDocumentTitle from "./i18n/MagdaDocumentTitle";
import AUpageAlert from "../pancake/react/page-alerts";

type Props = {
    error: {
        title: string;
        detail: string;
    };
};

const AUpageAlertAny = AUpageAlert as any;

class ErrorHandler extends React.Component<Props> {
    render() {
        return (
            <MagdaDocumentTitle prefixes={["Error"]}>
                <AUpageAlertAny as="error">
                    {this.props.error.title ? (
                        <h3>{this.props.error.title}</h3>
                    ) : null}
                    <p>{this.props.error.detail}</p>
                </AUpageAlertAny>
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
