import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true
});

const htmlRegex = /^\s*<[^>]+>/;

export default function markdownToHtml(
    markdownString: string,
    allowUnsafeHtml: boolean = false,
    options = {
        FORBID_TAGS: ["svg", "math", "style"]
    }
) {
    if (!markdownString || typeof markdownString !== "string") {
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
