import React from "react";
import ReactDocumentTitle from "react-document-title";
import MagdaNamespacesConsumer from "./MagdaNamespacesConsumer";

export default function MagdaDocumentTitle({ prefixes = [], children }) {
    return (
        <MagdaNamespacesConsumer ns={["global"]}>
            {(translate) => {
                const appName = translate(["appName", ""]);

                const title = (appName !== ""
                    ? prefixes.concat([appName])
                    : prefixes
                ).join(" | ");

                return (
                    <ReactDocumentTitle title={title}>
                        {children}
                    </ReactDocumentTitle>
                );
            }}
        </MagdaNamespacesConsumer>
    );
}
