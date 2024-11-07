import React, { FunctionComponent, useCallback, useEffect } from "react";
import { useAsync } from "react-async-hook";
import reportError from "helpers/reportError";
import GeoJsonViewer from "./GeoJsonViewer";
import MarkdownMermaid from "./MarkdownMermaid";
import { useHistory } from "react-router-dom";
import { config } from "../../config";

const { uiBaseUrl } = config;
const pathNameBase = uiBaseUrl === "/" ? "/" : uiBaseUrl + "/";

async function loadMarkdownPreview() {
    try {
        const [
            ReactMarkdownModule,
            RemarkGfmModule,
            RemarkMathModule,
            RehypeKatexModule,
            ReactSyntaxHilighterModule,
            prismStyleModule,
            RemarkBreaksModule,
            RemarkDefinitionListModule,
            RemarkExtendedTableModule,
            RehypeExternalLinksModule,
            RehypeUrlsModule
        ] = await Promise.all([
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "react-markdown"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "remark-gfm"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "remark-math"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "rehype-katex"
            ),
            import("react-syntax-highlighter"),
            import("react-syntax-highlighter/dist/esm/styles/prism"),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "remark-breaks"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "remark-definition-list"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "remark-extended-table"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "rehype-external-links"
            ),
            import(
                /* webpackChunkName: "react-markdown-preview-libs" */ "rehype-urls"
            ),
            import(
                // @ts-ignore
                /* webpackChunkName: "react-markdown-preview-libs" */ "github-markdown-css/github-markdown.css"
            ),
            import(
                // @ts-ignore
                /* webpackChunkName: "react-markdown-preview-libs" */ "katex/dist/katex.min.css"
            )
        ]);

        const ReactMarkdown = ReactMarkdownModule.default;
        const RemarkGfm = RemarkGfmModule.default;
        const RemarkMath = RemarkMathModule.default;
        const RehypeKatex = RehypeKatexModule.default;
        const { Prism: SyntaxHighlighter } = ReactSyntaxHilighterModule;
        const RemarkBreaks = RemarkBreaksModule.default;
        const RemarkDefinitionList = RemarkDefinitionListModule.default;
        const RemarkExtendedTable = RemarkExtendedTableModule.default;
        const RehypeExternalLinks = RehypeExternalLinksModule.default;
        const RehypeUrls = RehypeUrlsModule.default;

        const MarkdownPreview: FunctionComponent<{ source: string }> = ({
            source
        }) => {
            const code = useCallback((allProps) => {
                const {
                    node,
                    inline,
                    className,
                    children,
                    ...props
                } = allProps;
                const match = /language-(\w+)/.exec(className || "");
                if (match?.[1]?.toLowerCase() === "geojson") {
                    return <GeoJsonViewer geoJson={children} />;
                } else if (
                    match?.[1]?.toLowerCase() === "mermaid".toLowerCase()
                ) {
                    return (
                        <MarkdownMermaid definition={String(children).trim()} />
                    );
                }
                return !inline && match ? (
                    <SyntaxHighlighter
                        {...props}
                        children={String(children).replace(/\n$/, "")}
                        style={prismStyleModule.base16AteliersulphurpoolLight}
                        language={match[1]}
                        PreTag="div"
                    />
                ) : (
                    <code {...props} className={className}>
                        {children}
                    </code>
                );
            }, []);

            return (
                <ReactMarkdown
                    remarkPlugins={[
                        RemarkGfm,
                        RemarkMath,
                        RemarkBreaks,
                        RemarkDefinitionList,
                        RemarkExtendedTable
                    ]}
                    rehypePlugins={[
                        RehypeKatex,
                        [
                            RehypeExternalLinks,
                            {
                                rel: ["nofollow", "noopener", "noreferrer"],
                                target: "_blank"
                            }
                        ],
                        [
                            RehypeUrls,
                            function blankExternal(url, node) {
                                if (
                                    node.tagName === "a" &&
                                    typeof url.href === "string" &&
                                    url.href.indexOf(pathNameBase) === 0
                                ) {
                                    const hrefStr = JSON.stringify(url.href);
                                    node.properties.href = `javascript:window.textPreviewNavHistory.push(${hrefStr});`;
                                }
                            }
                        ]
                    ]}
                    components={{
                        code
                    }}
                >
                    {source}
                </ReactMarkdown>
            );
        };

        return MarkdownPreview;
    } catch (e) {
        reportError(`Failed to load content render module: ${e}`);
        throw e;
    }
}

const TextPreview: FunctionComponent<{ source: string }> = ({ source }) => {
    const {
        result: MarkdownPreview,
        loading: isMarkdownPreviewLoading
    } = useAsync(loadMarkdownPreview, []);

    const history = useHistory();

    useEffect(() => {
        (window as any)["textPreviewNavHistory"] = history;
    }, [history]);

    if (isMarkdownPreviewLoading || !MarkdownPreview) {
        return <pre>{source}</pre>;
    } else {
        return <MarkdownPreview source={source} />;
    }
};

export default TextPreview;
