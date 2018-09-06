// eslint-disable-next-line
import "es6-shim";
import "raf/polyfill";
import logger from "redux-logger";
import "./index.css";
import { BrowserRouter, Route } from "react-router-dom";

import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import AppContainer from "./AppContainer";
import PropTypes from "prop-types";
import ScrollToTop from "./helpers/ScrollToTop";
import ga from "./analytics/googleAnalytics";
import { composeWithDevTools } from "redux-devtools-extension/developmentOnly";
import * as URI from "urijs";

const store = createStore(
    reducer,
    composeWithDevTools(
        applyMiddleware(
            thunkMiddleware, // lets us dispatch() functions
            logger // neat middleware that logs actions
        )
    )
);

class GAListener extends React.Component {
    static contextTypes = {
        router: PropTypes.object
    };

    componentDidMount() {
        this.sendPageView(this.context.router.history.location);
        this.context.router.history.listen(this.sendPageView);
    }

    sendPageView(location) {
        ga("set", "location", location.pathname);
        ga("send", "pageview");
    }

    render() {
        return this.props.children;
    }
}

ReactDOM.render(
    <Provider store={store}>
        <BrowserRouter>
            <GAListener>
                <ScrollToTop>
                    <Route path="/" component={AppContainer} />
                </ScrollToTop>
            </GAListener>
        </BrowserRouter>
    </Provider>,
    document.getElementById("root")
);

function updateAppScssVars(params = {}) {
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    if (!stylesheet) {
        throw new Error("cannot find style element");
    }
    const newEl = stylesheet.cloneNode(true);
    const uri = new URI("/static/css/main.xxx.css");
    uri.search({ ...params, rnd: Math.random() });
    newEl.href = uri.toString();
    stylesheet.parentNode.removeChild(stylesheet);
    document.body.appendChild(newEl);
}

window.updateAppScssVars = updateAppScssVars;
