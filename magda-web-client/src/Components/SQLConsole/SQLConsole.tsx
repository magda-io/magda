import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useState
} from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    setIsOpen,
    setData,
    setEditorRef,
    setEditorContent
} from "../../actions/sqlConsoleActions";
import { StateType } from "reducers/reducer";
import { Small, Medium } from "../Common/Responsive";
import { useAsync } from "react-async-hook";
import Drawer from "rsuite/Drawer";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Button from "rsuite/Button";
import Loader from "rsuite/Loader";
import Panel from "rsuite/Panel";
import RadioGroup from "rsuite/RadioGroup";
import Radio from "rsuite/Radio";
import Table from "rsuite/Table";
import Tooltip from "rsuite/Tooltip";
import Whisper from "rsuite/Whisper";
import reportError from "helpers/reportError";
import { runQuery } from "../../libs/sqlUtils";
import downloadCsv from "../../libs/downloadCsv";
import { BsFillQuestionCircleFill } from "react-icons/bs";
import "./SQLConsole.scss";
import type { IAceEditor } from "react-ace/lib/types";
import reportWarn from "helpers/reportWarn";
import Popover from "rsuite/Popover";
import SimpleMathTextBox from "./SimpleMathTextBox";
import { config } from "../../config";

const { Column, HeaderCell, Cell } = Table;
interface PropsType {
    [key: string]: any;
}

const maxDisplayRows: number = config.sqlConsoleMaxDisplayRows;

/**
 * Convert any data array to an data array with single column with message
 *
 * @param {any[]} data
 * @return {*}  {any[]}
 */
function convertEmptyData(data: any[]): any[] {
    if (data?.length) {
        if (maxDisplayRows > 0 && data.length > maxDisplayRows) {
            return data.slice(0, maxDisplayRows);
        }
        return data;
    }
    return [{ "Query result:": "No data available for display..." }];
}

function convertCellData(data: any): any {
    if (data === null || data === undefined) {
        return "NULL";
    }
    if (typeof data === "boolean") {
        return data ? "true" : "false";
    }
    if (typeof data === "object") {
        return JSON.stringify(data);
    }
    if (typeof data === "string") {
        // replace all \r\n with \n
        return data.replace(/\r\n/g, "\n");
    }
    return data;
}

const SQLConsole: FunctionComponent<PropsType> = (props) => {
    const {
        isOpen,
        data,
        editorRef: aceEditorCtlRef,
        editorContent
    } = useSelector((state: StateType) => state.sqlConsole);
    const dispatch = useDispatch();
    const setAceEditorCtlRef = useCallback(
        (ref) => {
            dispatch(setEditorRef(ref));
        },
        [dispatch]
    );
    const [size, setSize] = useState<string>("sm");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloadingCsv, setIsDownloadingCsv] = useState<boolean>(false);
    const aceEditorRef = aceEditorCtlRef?.editor;

    const onRunQuery = useCallback(
        async (query: string, params?: any[]) => {
            try {
                if (!query.trim()) {
                    throw new Error("the query supplied was empty!");
                }
                setIsLoading(true);
                const result = await runQuery(query, params);
                if (
                    Object.prototype.toString.call(result) === "[object Error]"
                ) {
                    throw result;
                }
                // result will comes with `columns` field for RECORDSET query
                // e.g. `SELECT RECORDSET * from source(0) limit 1`
                const data = result?.columns ? result.columns : result;
                if (maxDisplayRows > 0 && data?.length > maxDisplayRows) {
                    reportWarn(
                        `Query result is large than ${maxDisplayRows} rows. Only the first ${maxDisplayRows} rows will be displayed. However, you still can download the full result as a CSV file.`,
                        { duration: 5000 }
                    );
                }
                dispatch(setData(data));
            } catch (e) {
                const errorMsg = String(e);
                const msg =
                    errorMsg.indexOf("Failed to fetch") !== -1
                        ? "Failed to fetch the nominated data file due to network error"
                        : errorMsg;
                reportError(`Failed to execute SQL query: ${msg}`, {
                    duration: 5000
                });
            } finally {
                setIsLoading(false);
            }
        },
        [dispatch]
    );

    const onClose = useCallback(() => {
        const value = aceEditorRef?.getValue();
        dispatch(setEditorContent(value ? value : ""));
        dispatch(setIsOpen(false));
    }, [dispatch, aceEditorRef]);

    const onEditorLoad = useCallback(
        (editor: IAceEditor) => {
            if (editorContent) {
                editor.setValue(editorContent);
            }
        },
        [editorContent]
    );

    const onRunQueryButtonClick = useCallback(() => {
        const value = aceEditorRef?.getValue();
        onRunQuery(value ? value : "");
    }, [aceEditorRef, onRunQuery]);

    useEffect(() => {
        if (aceEditorRef) {
            aceEditorRef.commands.addCommand({
                name: "executeQuery",
                bindKey: {
                    win: "Shift-Enter",
                    mac: "Shift-Enter"
                },
                exec: onRunQueryButtonClick
            });
        }
    }, [aceEditorRef, onRunQueryButtonClick]);

    const onDownloadButtonClick = useCallback(async () => {
        try {
            if (!data) {
                throw new Error("No data available to download!");
            }
            setIsDownloadingCsv(true);
            await downloadCsv(data, undefined, convertCellData);
        } catch (e) {
            reportError(e);
        } finally {
            setIsDownloadingCsv(false);
        }
    }, [data, setIsDownloadingCsv]);

    const {
        result: AceEditor,
        loading: loadingAceEditor
    } = useAsync(async () => {
        try {
            const [{ default: AceEditor }] = await Promise.all([
                import(/* webpackChunkName:'react-ace' */ "react-ace"),
                import(
                    /* webpackChunkName:'react-ace' */ "ace-builds/src-noconflict/mode-sql"
                ),
                import(
                    /* webpackChunkName:'react-ace' */ "ace-builds/src-noconflict/theme-xcode"
                )
            ]);
            return AceEditor;
        } catch (e) {
            reportError(`Failed to load JSON editor: ${e}`);
            return;
        }
    }, []);

    const makeDrawerHeader = useCallback(
        (screeSize: "sm" | undefined) =>
            screeSize === "sm" ? (
                <Drawer.Header>
                    <Drawer.Title>SQL Console</Drawer.Title>
                </Drawer.Header>
            ) : (
                <Drawer.Header>
                    <Drawer.Title>SQL Console</Drawer.Title>
                    <Drawer.Actions>
                        <RadioGroup
                            inline
                            appearance="picker"
                            value={size}
                            onChange={setSize as any}
                        >
                            <span className="size-selector-heading">
                                Size:{" "}
                            </span>
                            <Radio value="sm">Small</Radio>
                            <Radio value="lg">Medium</Radio>
                            <Radio value="full">Full Screen</Radio>
                        </RadioGroup>
                    </Drawer.Actions>
                </Drawer.Header>
            ),
        [size, setSize]
    );

    const helpTooltip = (
        <Tooltip className="magda-sql-console-help-icon-tooltip">
            Please refer to{" "}
            <a
                target="_blank"
                rel="nofollow noopener noreferrer"
                href="https://github.com/magda-io/magda/blob/main/docs/docs/sql-console-user-guide.md"
            >
                this document
            </a>{" "}
            for SQL Console usage information.
        </Tooltip>
    );

    const makeDrawerBody = () => {
        const convertData = convertEmptyData(data);
        return (
            <Drawer.Body className="magda-sql-console-body">
                {isDownloadingCsv ? (
                    <Loader
                        backdrop
                        content="Exporting CSV data file..."
                        vertical
                    />
                ) : null}
                <div className="magda-sql-console-main-content-container">
                    <div className="query-row">
                        <Panel bordered className="query-panel">
                            {loadingAceEditor ? (
                                <Loader
                                    backdrop
                                    content="Loading SQL editor..."
                                    vertical
                                />
                            ) : AceEditor ? (
                                <div className="sql-editor-container">
                                    <AceEditor
                                        ref={setAceEditorCtlRef}
                                        onLoad={onEditorLoad}
                                        width="100%"
                                        name="magda-sql-console-editor"
                                        mode="sql"
                                        theme="xcode"
                                        showGutter={false}
                                        showPrintMargin={false}
                                        highlightActiveLine={false}
                                        fontSize={12}
                                        lineHeight={15}
                                        focus={true}
                                        setOptions={{
                                            enableMobileMenu: false,
                                            showLineNumbers: false,
                                            tabSize: 2
                                        }}
                                    />
                                </div>
                            ) : (
                                "Error: cannot load SQL Editor."
                            )}
                        </Panel>
                        <div className="button-tool-bar">
                            <div className="help-icon-container">
                                <Whisper
                                    placement={"auto"}
                                    controlId="magda-sql-console-help-tooltip"
                                    trigger="hover"
                                    speaker={helpTooltip}
                                    delayClose={2000}
                                >
                                    <div className="help-icon">
                                        <BsFillQuestionCircleFill className="help-icon" />
                                    </div>
                                </Whisper>
                            </div>
                            <ButtonToolbar>
                                <Button
                                    className="run-query-button"
                                    appearance="primary"
                                    onClick={onRunQueryButtonClick}
                                >
                                    Run Query
                                </Button>
                                <Button
                                    className="download-result-button"
                                    appearance="primary"
                                    disabled={!data?.length}
                                    onClick={onDownloadButtonClick}
                                >
                                    Download Result
                                </Button>
                            </ButtonToolbar>
                        </div>
                    </div>
                    <Panel className="data-row" bordered>
                        {isLoading ? (
                            <Loader
                                backdrop
                                content="Executing query..."
                                vertical
                            />
                        ) : (
                            <Table
                                virtualized={true}
                                fillHeight={true}
                                hover={true}
                                showHeader={true}
                                cellBordered={true}
                                headerHeight={30}
                                rowHeight={30}
                                data={convertData}
                            >
                                {Object.keys(convertData[0]).map((key, idx) => (
                                    <Column
                                        width={130}
                                        key={idx}
                                        resizable
                                        flexGrow={1}
                                    >
                                        <HeaderCell style={{ padding: 4 }}>
                                            {key}
                                        </HeaderCell>
                                        <Cell
                                            dataKey={key}
                                            style={{ padding: 4 }}
                                        >
                                            {(rowData) => {
                                                const convertedContent = convertCellData(
                                                    rowData[key]
                                                );
                                                if (
                                                    typeof convertedContent ===
                                                        "string" &&
                                                    convertedContent.length < 25
                                                ) {
                                                    return convertedContent;
                                                } else {
                                                    return (
                                                        <Whisper
                                                            trigger="click"
                                                            placement="auto"
                                                            speaker={
                                                                <Popover>
                                                                    <SimpleMathTextBox>
                                                                        {
                                                                            convertedContent
                                                                        }
                                                                    </SimpleMathTextBox>
                                                                </Popover>
                                                            }
                                                        >
                                                            <div className="magda-sql-console-cell-content-with-tooltip">
                                                                {
                                                                    convertedContent
                                                                }
                                                            </div>
                                                        </Whisper>
                                                    );
                                                }
                                            }}
                                        </Cell>
                                    </Column>
                                ))}
                            </Table>
                        )}
                    </Panel>
                </div>
            </Drawer.Body>
        );
    };

    return (
        <div className="magda-sql-console-main-container">
            <Small>
                <Drawer
                    className="magda-sql-console-drawer"
                    placement={"bottom"}
                    open={isOpen}
                    onClose={onClose}
                    backdrop={false}
                    size={"full" as any}
                >
                    {makeDrawerHeader("sm")}
                    {makeDrawerBody()}
                </Drawer>
            </Small>
            <Medium>
                <Drawer
                    className="magda-sql-console-drawer"
                    placement={"bottom"}
                    open={isOpen}
                    onClose={onClose}
                    backdrop={true}
                    size={size as any}
                >
                    {makeDrawerHeader(undefined)}
                    {makeDrawerBody()}
                </Drawer>
            </Medium>
        </div>
    );
};

export default SQLConsole;
