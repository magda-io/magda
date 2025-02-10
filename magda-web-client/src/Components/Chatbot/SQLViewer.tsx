import React, { FunctionComponent, useCallback } from "react";
import { useDispatch } from "react-redux";
import {
    setData,
    setEditorContent,
    setIsOpen
} from "../../actions/sqlConsoleActions";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import Panel from "rsuite/Panel";
import Button from "rsuite/Button";
import Stack from "rsuite/Stack";

interface SQLViewerProps {
    sql: string;
}

const SQLViewer: FunctionComponent<SQLViewerProps> = ({ sql }) => {
    const dispatch = useDispatch();

    const openSqlConsoleHandler = useCallback(() => {
        dispatch(setData([]));
        dispatch(setIsOpen(true));
        dispatch(setEditorContent(sql));
    }, [dispatch, sql]);

    return (
        <Panel
            className="markdown-sql-viewer-block"
            bordered
            header={
                <Stack direction="row-reverse">
                    <Button onClick={openSqlConsoleHandler}>SQL Console</Button>
                </Stack>
            }
        >
            <SyntaxHighlighter
                children={String(sql).trim()}
                style={tomorrow}
                language={"sql"}
                PreTag="div"
            />
        </Panel>
    );
};

export default SQLViewer;
