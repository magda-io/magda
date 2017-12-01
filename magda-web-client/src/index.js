// @flow
// eslint-disable-next-line
import'es6-shim';

import createLogger from "redux-logger";
import "./index.css";
import {
  BrowserRouter,
  Route,
} from "react-router-dom";


import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import AppContainer from "./AppContainer";
import PropTypes from 'prop-types';

// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store: Store = createStore(
  reducer,
  applyMiddleware(
    thunkMiddleware, // lets us dispatch() functions
    loggerMiddleware // neat middleware that logs actions
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
    window.ga("set", "location", location.pathname);
    window.ga("send", "pageview");
  }

  render() {
    return this.props.children;
  }
}

ReactDOM.render(
  <Provider store={store}>
    <BrowserRouter>
      <GAListener>
        <Route path="/" component={AppContainer}/>
      </GAListener>
    </BrowserRouter>
  </Provider>,
  document.getElementById("root")
);
