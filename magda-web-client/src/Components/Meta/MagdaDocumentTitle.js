import React from "react";
import ReactDocumentTitle from "react-document-title";
import { NamespacesConsumer } from "react-i18next";

export default function MagdaDocumentTitle({ prefixes = [], children }) {
    return (
        <NamespacesConsumer ns={["global"]}>
            {translate => {
                const title = prefixes
                    .concat([translate("appName")])
                    .join(" | ");

                return (
                    <ReactDocumentTitle title={title}>
                        {children}
                    </ReactDocumentTitle>
                );
            }}
        </NamespacesConsumer>
    );
}
