import React from "react";
import "./MarkdownViewer.scss";
import clip from "text-clipper";
import markdownToHtml from "@magda/typescript-common/dist/markdownToHtml.js";

class MarkdownViewer extends React.Component {
    render() {
        let html = markdownToHtml(this.props.markdown || "");
        if (this.props.truncate === true) {
            html = clip(
                html,
                this.props.truncateLength ? this.props.truncateLength : 150,
                { html: true }
            );
        }
        const markdown = { __html: html };
        return <div className="markdown" dangerouslySetInnerHTML={markdown} />;
    }
}

MarkdownViewer.defaultProps = { markdown: "" };

export default MarkdownViewer;

/**
 * Tell whether content provided will be truncated or not.
 * It's useful when you need to tell whether a toggel button should be shown or not
 */
export function willBeTruncated(
    markdownString,
    truncateLength,
    allowUnsafeHtml,
    options
) {
    const OrigHtml = markdownToHtml(markdownString);
    const TruncatedHtml = clip(OrigHtml, truncateLength, { html: true });
    if (OrigHtml.trim() === TruncatedHtml.trim()) return false;
    return true;
}
