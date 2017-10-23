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
import { staticPageRegister } from "./content/register";
import AppContainer from "./AppContainer";


// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store: Store = createStore(
  reducer,
  applyMiddleware(
    thunkMiddleware, // lets us dispatch() functions
    loggerMiddleware // neat middleware that logs actions
  )
);

// const recordNewRoute = location => {
//   window.ga("set", "location", document.location);
//   window.ga("send", "pageview");
//   browserHistory.lastLocation = browserHistory.currentLocation;
//   browserHistory.currentLocation = location;
// };
// recordNewRoute(browserHistory.getCurrentLocation());
// browserHistory.listen(recordNewRoute);


ReactDOM.render(
  <Provider store={store}>
    <BrowserRouter>
        <Route path="/" component={AppContainer}/>
    </BrowserRouter>
  </Provider>,
  document.getElementById("root")
);
