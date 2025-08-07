import React, { FunctionComponent, useCallback } from "react";
import { useAsync } from "react-async-hook";
import reportError from "helpers/reportError";
import GeoJsonViewer from "./GeoJsonViewer";
import MarkdownMermaid from "./MarkdownMermaid";
import EchartsViewer from "./EchartsViewer";
import SQLViewer from "./SQLViewer";
import CommonLink from "../Common/CommonLink";
import { config } from "../../config";

const { uiBaseUrl } = config;
const pathNameBase = uiBaseUrl === "/" ? "/" : uiBaseUrl + "/";

function sanitizeTransformImg(allProps: any): JSX.Element {
    try {
        const { src, alt } = allProps;
        const url = src;

        if (!url) {
            return <div>[Img {alt} has empty `src`]</div>;
        }

        const trimmed = url.trim();

        // Handle data URI
        if (trimmed.startsWith("data:")) {
            const dataUriRegex = /^data:(image\/(png|jpeg));base64,([a-zA-Z0-9+/=]+)$/;
            const match = trimmed.match(dataUriRegex);

            if (!match) {
                return <div>[Img {alt} has unsupported Data URI]</div>;
            }

            const mimeType = match[1];
            const base64Data = match[3];

            // Decode and check image header
            const binary = atob(base64Data);
            const byteArray = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                byteArray[i] = binary.charCodeAt(i);
            }

            // PNG header: 89 50 4E 47
            if (
                mimeType === "image/png" &&
                byteArray[0] === 0x89 &&
                byteArray[1] === 0x50 &&
                byteArray[2] === 0x4e &&
                byteArray[3] === 0x47
            ) {
                return <img src={trimmed} alt={alt ? alt : ""} />;
            }

            // JPEG header: FF D8
            if (
                mimeType === "image/jpeg" &&
                byteArray[0] === 0xff &&
                byteArray[1] === 0xd8
            ) {
                return <img src={trimmed} alt={alt ? alt : ""} />;
            }

            return <div>[Img {alt} has invalid Data URI]</div>;
        }

        // Handle http/https URLs
        const parsed = new URL(trimmed);

        if (parsed.protocol === "https:") {
            // only allow https urls
            return <img src={parsed.href} alt={alt ? alt : ""} />;
        }

        return (
            <div>
                [Img {alt} has unsupported url schema: {parsed.protocol}]
            </div>
        ); // Disallow other schemes
    } catch {
        return <div>[Failed to render IMG.]</div>;
    }
}

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
            RehypeExternalLinksModule
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
                // @ts-ignore
                /* webpackChunkName: "react-markdown-preview-libs" */ "github-markdown-css/github-markdown.css"
            ),
            import(
                // @ts-ignore
                /* webpackChunkName: "react-markdown-preview-libs" */ "katex/dist/katex.min.css"
            )
        ]);

        const ReactMarkdown = ReactMarkdownModule.default;
        const defaultUrlTransform = ReactMarkdownModule.defaultUrlTransform;
        const RemarkGfm = RemarkGfmModule.default;
        const RemarkMath = RemarkMathModule.default;
        const RehypeKatex = RehypeKatexModule.default;
        const { Prism: SyntaxHighlighter } = ReactSyntaxHilighterModule;
        const RemarkBreaks = RemarkBreaksModule.default;
        const RemarkDefinitionList = RemarkDefinitionListModule.default;
        const RemarkExtendedTable = RemarkExtendedTableModule.default;
        const RehypeExternalLinks = RehypeExternalLinksModule.default;

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
                } else if (
                    match?.[1]?.toLowerCase() === "echarts".toLowerCase()
                ) {
                    return (
                        <EchartsViewer configJson={String(children).trim()} />
                    );
                } else if (match?.[1]?.toLowerCase() === "sql".toLowerCase()) {
                    return <SQLViewer sql={String(children).trim()} />;
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

            const anchor = useCallback((allProps) => {
                const { children, node, ...props } = allProps;
                return <CommonLink {...props}>{children}</CommonLink>;
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
                        ]
                    ]}
                    components={{
                        code,
                        a: anchor,
                        img: sanitizeTransformImg
                    }}
                    urlTransform={(url, key, node) => {
                        if (
                            key === "href" &&
                            node.tagName === "a" &&
                            url.indexOf(pathNameBase) === 0
                        ) {
                            // internal link should skip defaultUrlTransform
                            // we will transform it as our own CommonLink component
                            return url;
                        } else if (key === "src" && node.tagName === "img") {
                            // we will skip img url being processed by defaultUrlTransform here
                            // instead, we will check & sanitize it in imgTransformFunc
                            return url;
                        } else {
                            return defaultUrlTransform(url);
                        }
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

    if (isMarkdownPreviewLoading || !MarkdownPreview) {
        return <pre>{source}</pre>;
    } else {
        return <MarkdownPreview source={source} />;
    }
};

export default TextPreview;
