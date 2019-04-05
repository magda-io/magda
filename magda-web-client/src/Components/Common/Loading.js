import React from "react";
import ReactDocumentTitle from "react-document-title";
import { needsContent } from "helpers/content";

class Loading extends React.Component {
    render() {
        const strings = this.props.strings || {};

        return (
            <ReactDocumentTitle title={`${strings.applicationName}`}>
                <p>{strings.loading}</p>
            </ReactDocumentTitle>
        );
    }
}

export default needsContent("strings")(Loading);
