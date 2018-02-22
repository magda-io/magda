// @flow

// eslint-disable-next-line
import expect from "expect";
// eslint-disable-next-line
// import deepFreeze from 'deep-freeze';
import record from "./recordReducer";
import userManagement from "./userManagementReducer";
import connectors from "./connectorsReducer";

import { combineReducers } from "redux";

const reducer = combineReducers({
    record,
    userManagement,
    connectors
});

export default reducer;
