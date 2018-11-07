import React from "react";
import { NamespacesConsumer } from "react-i18next";

function returnBlankString() {
    return "";
}

export default function MagdaNamespacesConsumer(props) {
    const passThroughProps = {
        ...props,
        children: (translate, options) => {
            const modifiedTranslate = options.ready
                ? translate
                : returnBlankString;
            return props.children(modifiedTranslate, options);
        }
    };

    return <NamespacesConsumer {...passThroughProps} />;
}
