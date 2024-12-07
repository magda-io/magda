import React, {
    FunctionComponent,
    useCallback,
    useEffect,
    useState
} from "react";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
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
import {
    runQuery,
    setCurrentDistList,
    dataset2DistributionResourceItems,
    distribution2ResourceItem,
    setCurrentDist
} from "../../libs/sqlUtils";
import downloadCsv from "../../libs/downloadCsv";
import { BsFillQuestionCircleFill } from "react-icons/bs";
import type ReactAce from "react-ace";
import "./SQLConsole.scss";

const { Column, HeaderCell, Cell } = Table;
interface PropsType {
    [key: string]: any;
}

/**
 * Convert any data array to an data array with single column with message
 *
 * @param {any[]} data
 * @return {*}  {any[]}
 */
function convertEmptyData(data: any[]): any[] {
    if (data?.length) {
        return data;
    }
    return [{ "Query result:": "No data available for display..." }];
}

const SQLConsole: FunctionComponent<PropsType> = (props) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [size, setSize] = useState<string>("sm");
    const [data, setData] = useState<Record<string, any>[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloadingCsv, setIsDownloadingCsv] = useState<boolean>(false);
    const [aceEditorCtlRef, setAceEditorCtlRef] = useState<ReactAce | null>(
        null
    );
    const aceEditorRef = aceEditorCtlRef?.editor;

    const dataset = useSelector<StateType, ParsedDataset | undefined>(
        (state) => state.record.dataset
    );
    const distribution = useSelector<StateType, ParsedDistribution | undefined>(
        (state) => state.record.distribution
    );

    const onRunQuery = useCallback(
        async (query: string, params?: any[]) => {
            try {
                if (!query.trim()) {
                    throw new Error("the query supplied was empty!");
                }
                setIsLoading(true);
                const result = await runQuery(query, params);
                setData(result);
            } catch (e) {
                reportError(`Failed to execute SQL query: ${e}`);
            } finally {
                setIsLoading(false);
            }
        },
        [setData]
    );

    const onClose = useCallback(() => {
        setIsOpen(false);
    }, [setIsOpen]);

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
            await downloadCsv(data);
        } catch (e) {
            reportError(`Error: ${e}`);
        } finally {
            setIsDownloadingCsv(false);
        }
    }, [data, setIsDownloadingCsv]);

    const handleKeyPress = useCallback(
        (event: KeyboardEvent) => {
            if (
                event.shiftKey === true &&
                (event.metaKey === true || event.ctrlKey === true) &&
                event.key === "s"
            ) {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen((val) => !val);
            }
        },
        [setIsOpen]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKeyPress);

        return () => {
            document.removeEventListener("keydown", handleKeyPress);
        };
    }, [handleKeyPress]);

    useAsync(async () => {
        if (dataset?.identifier) {
            const items = dataset2DistributionResourceItems(dataset);
            setCurrentDistList(items);
            if (items?.length === 1) {
                setCurrentDist(items[0]);
            }
        }
        if (distribution?.identifier) {
            setCurrentDist(distribution2ResourceItem(distribution));
        }
    }, [dataset, distribution]);

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
                                <div
                                    className="sql-editor-container"
                                    style={{ height: "50px" }}
                                >
                                    <AceEditor
                                        ref={setAceEditorCtlRef}
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
                                        />
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
                    backdrop={false}
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
