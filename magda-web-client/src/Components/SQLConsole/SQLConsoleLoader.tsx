import { useRef, FunctionComponent, useCallback, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { StateType } from "../../reducers/reducer";
import {
    setEditorContent,
    toggleIsOpen
} from "../../actions/sqlConsoleActions";
import { useAsync } from "react-async-hook";
import reportError from "helpers/reportError";
import Loader from "rsuite/Loader";
import type SQLConsoleTypeImport from "./SQLConsole";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import {
    setCurrentDistList,
    dataset2DistributionResourceItems,
    distribution2ResourceItem,
    setCurrentDist
} from "../../libs/sqlUtils";
import { config } from "../../config";

const enableSqlConsole = config.enableSQLConsole;

const SQLConsoleLoader: FunctionComponent = () => {
    const sqlConsoleCompRef = useRef<typeof SQLConsoleTypeImport | null>(null);
    const SQLConsole = sqlConsoleCompRef?.current
        ? sqlConsoleCompRef.current
        : null;
    const { isOpen, editorRef } = useSelector(
        (state: StateType) => state.sqlConsole
    );
    const aceEditorRef = editorRef?.editor;
    const dispatch = useDispatch();
    const dataset = useSelector<StateType, ParsedDataset | undefined>(
        (state) => state.record.dataset
    );
    const distribution = useSelector<StateType, ParsedDistribution | undefined>(
        (state) => state.record.distribution
    );

    useAsync(async () => {
        // -- make sure current page dataset distributions have been available via `source()` in SQL
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

    const { loading: consoleLoading } = useAsync(
        async (isOpen, SQLConsole) => {
            try {
                if (SQLConsole || !isOpen || !enableSqlConsole) {
                    return;
                }
                const module = await import(
                    /* webpackChunkName: "magda-sqlconsole" */ "./SQLConsole"
                );
                sqlConsoleCompRef.current = module.default;
            } catch (e) {
                reportError("Failed to load SQLConsole component: " + e);
            }
        },
        [isOpen, SQLConsole]
    );

    const handleKeyPress = useCallback(
        (event: KeyboardEvent) => {
            if (
                event.shiftKey === true &&
                (event.metaKey === true || event.ctrlKey === true) &&
                event.key === "s"
            ) {
                event.preventDefault();
                event.stopPropagation();
                if (isOpen) {
                    const value = aceEditorRef?.getValue();
                    dispatch(setEditorContent(value ? value : ""));
                }
                dispatch(toggleIsOpen());
            }
        },
        [dispatch, isOpen, aceEditorRef]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKeyPress);

        return () => {
            document.removeEventListener("keydown", handleKeyPress);
        };
    }, [handleKeyPress]);

    return (
        <>
            {enableSqlConsole ? (
                <>
                    {SQLConsole ? <SQLConsole /> : null}
                    {!isOpen ? null : consoleLoading ? (
                        <Loader
                            style={{ color: "black" }}
                            backdrop
                            content="loading SQLConsole..."
                            vertical
                        />
                    ) : null}
                </>
            ) : null}
        </>
    );
};

export default SQLConsoleLoader;
