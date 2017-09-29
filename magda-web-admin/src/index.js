// @flow
// eslint-disable-next-line
import'es6-shim';

import createLogger from "redux-logger";
import "./index.css";
import {
  Router,
  Route,
  IndexRoute,
  IndexRedirect,
  browserHistory,
  Redirect
} from "react-router";

import thunkMiddleware from "redux-thunk";
import React from "react";
import ReactDOM from "react-dom";
import Home from "./Components/Home";
import AppContainer from "./Components/AppContainer";

import Account from "./Components/Account/Account";
import Connectors from "./Components/Admin/Connectors";
import signInRedirect from "./Components/Account/SignInRedirect";

import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import { requestWhoAmI } from "./actions/userManagementActions";





// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store: Store = createStore(
  reducer,
  applyMiddleware(
    thunkMiddleware, // lets us dispatch() functions
    loggerMiddleware // neat middleware that logs actions
  )
);

const recordNewRoute = location => {
  window.ga("set", "location", document.location);
  window.ga("send", "pageview");
  browserHistory.lastLocation = browserHistory.currentLocation;
  browserHistory.currentLocation = location;
};
recordNewRoute(browserHistory.getCurrentLocation());
browserHistory.listen(recordNewRoute);

function loadDefaultData(store) {
  store.dispatch(requestWhoAmI());
}

// If you add a new top-level route below, you must also add it to src/index.ts in magda-web-server!

ReactDOM.render(
  <Provider store={store}>
    <Router history={browserHistory}>
      <Route path="/" component={AppContainer} onEnter={loadDefaultData(store)}>
        <IndexRoute component={Home} />
        <Route path="account" component={Account} />
        <Route path="admin/connectors" component={Connectors} />
      </Route>
    </Router>
  </Provider>,
  document.getElementById("root")
);
