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
import "./SQLViewer.scss";

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
            className="magda-markdown-sql-viewer-block"
            bordered
            bodyFill
            header={
                <Stack direction="row-reverse">
                    <Button
                        size="sm"
                        appearance="ghost"
                        onClick={openSqlConsoleHandler}
                    >
                        Open
                    </Button>
                </Stack>
            }
        >
            <SyntaxHighlighter
                className="syntax-highlighter-container"
                children={String(sql).trim()}
                style={tomorrow}
                language={"sql"}
                PreTag="div"
            />
        </Panel>
    );
};

export default SQLViewer;
