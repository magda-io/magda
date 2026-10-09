import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import Nav from "rsuite/Nav";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import type { Editor as AceEditor } from "brace";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { markdownEditor } from "Components/Editing/Editors/markdownEditor";

type PropsType = {
    value: string;
    onChange: (value: string) => void;
    height?: string;
};

type TabType = "write" | "preview";

/**
 * A markdown editor with a preview tab.
 * The preview is rendered the same way as the static page (`/page/<slug>`) content.
 */
const MarkdownEditor: FunctionComponent<PropsType> = ({
    value,
    onChange,
    height = "400px"
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<AceEditor | null>(null);
    const valueRef = useRef<string>(value);
    valueRef.current = value;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const [activeTab, setActiveTab] = useState<TabType>("write");

    const { loading, error } = useAsync(async () => {
        const ace = await import(/* webpackChunkName:'brace' */ "brace");
        await Promise.all([
            import(
                /* webpackChunkName:'brace-mode-markdown' */ "brace/mode/markdown"
            ),
            import(/* webpackChunkName:'brace' */ "brace/theme/github")
        ]);
        if (!containerRef.current) {
            return;
        }
        const editor = ace.edit(containerRef.current);
        editor.$blockScrolling = Infinity;
        editor.getSession().setMode("ace/mode/markdown");
        editor.setTheme("ace/theme/github");
        editor.setOption("wrap", true);
        editor.setValue(valueRef.current ? valueRef.current : "", -1);
        editor.on("change", () => {
            const newValue = editor.getValue();
            if (newValue !== valueRef.current) {
                onChangeRef.current(newValue);
            }
        });
        editorRef.current = editor;
    }, []);

    // sync value changes made outside the editor (e.g. loading a page)
    useEffect(() => {
        const editor = editorRef.current;
        const newValue = value ? value : "";
        if (editor && editor.getValue() !== newValue) {
            editor.setValue(newValue, -1);
        }
    }, [value]);

    useEffect(
        () => () => {
            editorRef.current?.destroy();
            editorRef.current = null;
        },
        []
    );

    let previewBody = "";
    if (activeTab === "preview") {
        try {
            previewBody = safeLoadFront(value ? value : "").__content;
        } catch (e) {
            previewBody = value;
        }
    }

    return (
        <div className="markdown-editor">
            <Nav
                appearance="tabs"
                activeKey={activeTab}
                onSelect={(key) => {
                    setActiveTab(key as TabType);
                    if (key === "write") {
                        setTimeout(() => editorRef.current?.resize(), 0);
                    }
                }}
            >
                <Nav.Item eventKey="write">Write</Nav.Item>
                <Nav.Item eventKey="preview">Preview</Nav.Item>
            </Nav>
            {error ? (
                <Message showIcon type="error" header="Error">
                    Failed to load the editor: {`${error}`}
                </Message>
            ) : null}
            <div
                className="markdown-editor-body"
                style={{
                    height,
                    display: activeTab === "write" ? "block" : "none"
                }}
            >
                {loading ? <Loader center content="loading editor..." /> : null}
                <div ref={containerRef} style={{ width: "100%", height }} />
            </div>
            {activeTab === "preview" ? (
                <div className="markdown-editor-preview" style={{ height }}>
                    {previewBody.trim() ? (
                        markdownEditor.view(previewBody)
                    ) : (
                        <i>Nothing to preview</i>
                    )}
                </div>
            ) : null}
        </div>
    );
};

export default MarkdownEditor;
