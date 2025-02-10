import { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";
import type ReactAce from "react-ace";

export type SQLConsoleDataType = Record<string, any>[];

export interface SQLConsoleStateType {
    isOpen: boolean;
    data: SQLConsoleDataType;
    editorRef: ReactAce | null;
    // for performance consideration, this field isn't backed by a "controlled" input
    // We mainly save the editor content when it's removed from view and recover the content when it's added into the view
    editorContent: string;
}

const initialData: SQLConsoleStateType = {
    isOpen: false,
    data: [],
    editorRef: null,
    editorContent: ""
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
        case actionTypes.SQL_CONSOLE_SET_EDITOR_CONTENT:
            return {
                ...state,
                editorContent: action.payload
            };
        default:
            return state;
    }
};
export default sqlConsoleReducer;
