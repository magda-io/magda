import { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";
import type ReactAce from "react-ace";

type SQLConsoleDataType = Record<string, any>[];

export interface SQLConsoleStateType {
    isOpen: boolean;
    data: SQLConsoleDataType;
    editorRef: typeof ReactAce | null;
}

const initialData: SQLConsoleStateType = {
    isOpen: false,
    data: [],
    editorRef: null
};

const sqlConsoleReducer = (
    state: SQLConsoleStateType = initialData,
    action: Action
) => {
    switch (action.type) {
        case actionTypes.SQL_CONSOLE_SET_IS_OPEN:
            return {
                ...state,
                isOpen: action.payload
            };
        case actionTypes.SQL_CONSOLE_SET_DATA:
            return {
                ...state,
                data: action.payload
            };
        case actionTypes.SQL_CONSOLE_SET_EDITOR_REF:
            return {
                ...state,
                editorRef: action.payload
            };
        default:
            return state;
    }
};
export default sqlConsoleReducer;
