// eslint-disable-next-line
import logger from "redux-logger";
import "./index.scss";
import { BrowserRouter, Route, withRouter } from "react-router-dom";

import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import { gapi } from "./analytics/ga";
import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware, compose } from "redux";
import AppContainer from "./AppContainer";
import PropTypes from "prop-types";
import ScrollToTop from "./helpers/ScrollToTop";
import "./i18n";
import { config } from "./config";
const { uiBaseUrl } = config;

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const store = createStore(
    reducer,
    composeEnhancers(
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
        this.sendPageView(this.props.history.location);
        this.props.history.listen(this.sendPageView);
    }

    sendPageView(location) {
        // Send pageview event to the initialised tracker(s).
        gapi.pageview(location.pathname);
    }

    render() {
        return this.props.children;
    }
}

const GAListenerWithRouter = withRouter(GAListener);

ReactDOM.render(
    <Provider store={store}>
        <BrowserRouter
            basename={
                uiBaseUrl !== "/" &&
                uiBaseUrl.lastIndexOf("/") === uiBaseUrl.length - 1
                    ? uiBaseUrl.substr(0, uiBaseUrl.length - 1)
                    : uiBaseUrl
            }
        >
            <GAListenerWithRouter>
                <ScrollToTop>
                    <Route path="/" component={AppContainer} />
                </ScrollToTop>
            </GAListenerWithRouter>
        </BrowserRouter>
    </Provider>,
    document.getElementById("root")
);
