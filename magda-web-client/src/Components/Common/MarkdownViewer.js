import React from "react";
import MarkdownIt from "markdown-it";
import "./MarkdownViewer.scss";
import defined from "helpers/defined";
import truncate from "html-truncate";
var DOMPurify = require("dompurify/dist/purify");

class MarkdownViewer extends React.Component {
    render() {
        let html = markdownToHtml(this.props.markdown || "");
        if (this.props.truncate === true) {
            html = truncate(
                html,
                this.props.truncateLength ? this.props.truncateLength : 150
            );
        }
        let markdown = { __html: html };
        return <div className="markdown" dangerouslySetInnerHTML={markdown} />;
    }
}

MarkdownViewer.defaultProps = { markdown: "" };

export default MarkdownViewer;

const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true
});

const htmlRegex = /^\s*<[^>]+>/;

export function markdownToHtml(
    markdownString,
    allowUnsafeHtml,
    options = {
        FORBID_TAGS: ["svg", "math"]
    }
) {
    if (!defined(markdownString) || markdownString.length === 0) {
        return markdownString;
    }
    // If the text looks like html, don't try to interpret it as Markdown because
    // we'll probably break it in the process.
    var unsafeHtml;
    if (htmlRegex.test(markdownString)) {
        unsafeHtml = markdownString;
    } else {
        // Note this would wrap non-standard tags such as <collapsible>hi</collapsible> in a <p></p>, which is bad.
        unsafeHtml = md.render(markdownString);
    }
    if (allowUnsafeHtml) {
        return unsafeHtml;
    } else {
        return DOMPurify.sanitize(unsafeHtml, options);
    }
}

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
    const TruncatedHtml = truncate(OrigHtml, truncateLength);
    if (OrigHtml.trim() === TruncatedHtml.trim()) return false;
    return true;
}
