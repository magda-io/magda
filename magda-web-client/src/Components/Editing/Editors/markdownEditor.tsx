import React from "react";
import Editor from "./Editor";

import markdownToHtml from "@magda/typescript-common/dist/markdownToHtml";
import starIcon from "assets/star.svg";

// TODO:
// Had a lot of trouble getting DraftJS from here to work: https://github.com/magda-io/magda/issues/1825
// Not planning to waste any more time on it so
// I've just put simpleMDE here. It is simple and I know that it works readily with react.
import AsyncComponent from "Components/AsyncComponent";
import "easymde/dist/easymde.min.css";

export const markdownEditor: Editor<string> = {
    edit: (value: any, onChange: Function) => {
        const callback = (text) => {
            onChange(text);
        };
        return (
            <AsyncComponent
                value={value}
                onChange={callback}
                importComponent={() =>
                    import("react-simplemde-editor").then((x) => x.default)
                }
            />
        );
        // return <MDEditor value={value} onChange={callback} />;
    },
    view: (value: any) => {
        let html = markdownToHtml(value || "");

        // replace star emoji with star icon
        html = html.replace(/⭐/g, `<img src="${starIcon}" />`);

        return (
            <React.Fragment>
                <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{
                        __html: html
                    }}
                />
            </React.Fragment>
        );
    }
};
