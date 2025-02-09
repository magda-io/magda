import React, { FunctionComponent, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setData, setIsOpen } from "../../actions/sqlConsoleActions";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import Panel from "rsuite/Panel";
import Button from "rsuite/Button";
import Stack from "rsuite/Stack";
import { StateType } from "reducers/reducer";
import ReactAce from "react-ace/lib/ace";
import reportError from "helpers/reportError";

interface SQLViewerProps {
    sql: string;
}

const SQLViewer: FunctionComponent<SQLViewerProps> = ({ sql }) => {
    const dispatch = useDispatch();
    const editorRef = useSelector<StateType, ReactAce | null>(
        (state) => state.sqlConsole.editorRef
    );
    const editor = editorRef?.editor;

    const openSqlConsoleHandler = useCallback(() => {
        if (!editor) {
            return;
        }
        editor.setValue(sql);
        dispatch(setData([]));
        dispatch(setIsOpen(true));
    }, [dispatch, editor, sql]);

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
