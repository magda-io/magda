import React from "react";
import ReactDocumentTitle from "react-document-title";
import { needsContent } from "../helpers/content";

class RecordHandler extends React.Component {
    render() {
        return (
            <ReactDocumentTitle title={`${this.props.strings.applicationName}`}>
                <p>{this.props.strings.loading}</p>
            </ReactDocumentTitle>
        );
    }
}

export default needsContent("strings")(RecordHandler);
