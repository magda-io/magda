// @flow
// eslint-disable-next-line
import "es6-shim";

import createLogger from "redux-logger";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import AppContainer from "./AppContainer";
import { Route } from "react-router-dom";

import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";

// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store: Store = createStore(
    reducer,
    applyMiddleware(
        thunkMiddleware, // lets us dispatch() functions
        loggerMiddleware // neat middleware that logs actions
    )
);

ReactDOM.render(
    <Provider store={store}>
        <BrowserRouter basename="/admin">
            <Route path="/" component={AppContainer} />
        </BrowserRouter>
    </Provider>,
    document.getElementById("root")
);
