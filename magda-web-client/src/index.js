// eslint-disable-next-line
import "es6-shim";
import "raf/polyfill";
import "isomorphic-fetch";
import logger from "redux-logger";
import "./index.css";
import { Router, Route } from "react-router-dom";
import history from "./history";

import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import { gapi } from "./analytics/ga";
import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import AppContainer from "./AppContainer";
import PropTypes from "prop-types";
import ScrollToTop from "./helpers/ScrollToTop";
import { composeWithDevTools } from "redux-devtools-extension/developmentOnly";
import { UIPreviewerManager, UIPreviewerTarget } from "./helpers/UIPreviewer";
import "./i18n";

const store = createStore(
    reducer,
    composeWithDevTools(
        applyMiddleware(
            thunkMiddleware, // lets us dispatch() functions
            logger // neat middleware that logs actions
        )
    )
);

window.UIPreviewerManager = UIPreviewerManager;

const uiPreviewerTarget = new UIPreviewerTarget(store);
uiPreviewerTarget.register();

class GAListener extends React.Component {
    static contextTypes = {
        router: PropTypes.object
    };

    componentDidMount() {
        this.sendPageView(this.context.router.history.location);
        this.context.router.history.listen(this.sendPageView);
    }

    sendPageView(location) {
        // Send pageview event to the initialised tracker(s).
        gapi.pageview(location.pathname);
    }

    render() {
        return this.props.children;
    }
}

ReactDOM.render(
    <Provider store={store}>
        <Router history={history}>
            <GAListener>
                <ScrollToTop>
                    <Route path="/" component={AppContainer} />
                </ScrollToTop>
            </GAListener>
        </Router>
    </Provider>,
    document.getElementById("root")
);
