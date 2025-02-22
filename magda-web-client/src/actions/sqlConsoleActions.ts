import { Action, Dispatch, GetState } from "../types";
import { actionTypes } from "../constants/ActionTypes";
import type ReactAce from "react-ace";
import { SQLConsoleDataType } from "../reducers/sqlConsoleReducer";
import { config } from "../config";
import reportError from "helpers/reportError";

const enableSqlConsole = config.enableSQLConsole;

export function setIsOpen(isOpen: boolean) {
    if (enableSqlConsole) {
        return {
            type: actionTypes.SQL_CONSOLE_SET_IS_OPEN,
            payload: isOpen
        };
    } else {
        return async (dispatch: Dispatch, getState: GetState) => {
            reportError("SQL Console is disabled");
        };
    }
}

export function toggleIsOpen() {
    return async (dispatch: Dispatch, getState: GetState) => {
        if (!enableSqlConsole) {
            reportError("SQL Console is disabled");
        } else {
            const state = getState();
            const isOpen = !state.sqlConsole.isOpen;
            dispatch({
                type: actionTypes.SQL_CONSOLE_SET_IS_OPEN,
                payload: isOpen
            });
        }
    };
}

export function setData(data: SQLConsoleDataType): Action {
    return {
        type: actionTypes.SQL_CONSOLE_SET_DATA,
        payload: data
    };
}

export function setEditorRef(editorRef: ReactAce): Action {
    return {
        type: actionTypes.SQL_CONSOLE_SET_EDITOR_REF,
        payload: editorRef
    };
}

export function setEditorContent(content: string): Action {
    return {
        type: actionTypes.SQL_CONSOLE_SET_EDITOR_CONTENT,
        payload: content
    };
}
