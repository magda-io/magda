// eslint-disable-next-line
import "es6-shim";
import "raf/polyfill";
import logger from "redux-logger";
import "./index.css";
import { BrowserRouter, Route } from "react-router-dom";

import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import ReactGA from "react-ga";
import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import AppContainer from "./AppContainer";
import PropTypes from "prop-types";
import ScrollToTop from "./helpers/ScrollToTop";
import { composeWithDevTools } from "redux-devtools-extension/developmentOnly";

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
        // Send pageview event to the initialised tracker(s).
        ReactGA.pageview(location.pathname);
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
