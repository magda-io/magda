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
import Search from "./Search/Search";
import RecordHandler from "./Components/RecordHandler";
import AppContainer from "./Components/AppContainer";

import Feedback from "./Components/Feedback";
import Contact from "./Components/Contact";
import Account from "./Components/Account/Account";
import signInRedirect from "./Components/Account/SignInRedirect";

import { Provider } from "react-redux";
import reducer from "./reducers/reducer";
import { createStore, applyMiddleware } from "redux";
import { staticPageRegister } from "./content/register";
import DatasetDetails from "./Dataset/DatasetDetails";
import DatasetSummary from "./Dataset/DatasetSummary";
import DatasetDiscussion from "./Dataset/DatasetDiscussion";
import DatasetPublisher from "./Dataset/DatasetPublisher";

import ProjectsViewer from "./Project/ProjectsViewer";
import ProjectDetails from "./Project/ProjectDetails";
import CreateProject from "./Project/CreateProject";

import PublishersViewer from "./Publisher/PublishersViewer";
import PublisherDetails from "./Publisher/PublisherDetails";

import DistributionDetails from "./Dataset/DistributionDetails";
import DistributionPreview from "./Dataset/DistributionPreview";
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
        <Route path="search" component={Search} />
        <Route path="feedback" component={Feedback} />
        <Route path="contact" component={Contact} />
        <Route path="account" component={Account} />
        <Route path="sign-in-redirect" onEnter={signInRedirect} />

        <Route path="dataset/:datasetId" component={RecordHandler}>
          <IndexRedirect to="details" />
          <Route path="details" component={DatasetDetails} />
          <Route path="discussion" component={DatasetDiscussion} />
          <Route path="publisher" component={DatasetPublisher} />
        </Route>
        <Route
          path="dataset/:datasetId/distribution/:distributionId"
          component={RecordHandler}
        >
          <IndexRedirect to="details" />
          <Route path="details" component={DistributionDetails} />
          <Route path="preview" component={DistributionPreview} />
        </Route>
        <Route path="projects" component={ProjectsViewer} />
        <Route path="projects/:projectId" component={ProjectDetails} />
        <Route path="project/new" component={CreateProject} />
        <Route path="publishers" component={PublishersViewer} />
        <Route path="publishers/:publisherId" component={PublisherDetails} />
        {staticPageRegister.map(item =>
          <Route path={`page/:id`} key={item.path} component={item.component} />
        )}
        <Redirect from="/about" to="page/about" />
        <Route path="preview/dataset/:datasetpreviewjson" component={DatasetSummary}/>

      </Route>
    </Router>
  </Provider>,
  document.getElementById("root")
);
