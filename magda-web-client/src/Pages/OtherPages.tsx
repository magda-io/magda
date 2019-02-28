import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import Search from "../Components/Search/Search";
import Account from "../Components/Account/Account";
import Login from "../Components/Account/Login";
import SignInRedirect from "../Components/Account/SignInRedirect";
import RecordHandler from "../Components/RecordHandler";
import PublishersViewer from "../Components/Publisher/PublishersViewer";
import PublisherDetails from "../Components/Publisher/PublisherDetails";
import StaticPage from "../Components/StaticPage";
import ErrorPage from "../Components/ErrorPage/index";
import SuggestDataset from "../Components/RequestDataset/SuggestDataset";
import NewDataset from "../Components/Dataset/New/NewDatasetLoader";
import RouteNotFound from "../Components/RouteNotFound";
import FallbackRouteHandler from "./FallbackRouteHandler";
import withHeader from "./withHeader";

import { config } from "../config";

const OtherPages = () => {
    return (
        <Switch>
            <Route
                exact
                path="/organisations"
                component={withHeader(PublishersViewer, false)}
            />
            <Route
                exact
                path="/publishers"
                render={() => <Redirect to="/organisations" />}
            />
            <Route
                path="/publishers/:publisherId"
                render={({ match }) => (
                    <Redirect
                        to={`/organisations/${match.params.publisherId}`}
                    />
                )}
            />
            <Route
                path="/organisations/:publisherId"
                component={withHeader(PublisherDetails, false)}
            />
            <Route exact path="/search" component={withHeader(Search, true)} />
            <Route
                exact
                path="/dataset"
                render={({ location }) => (
                    <Redirect
                        to={{
                            pathname: "/search",
                            search: location.search
                        }}
                    />
                )}
            />
            <Route
                exact
                path="/account"
                component={withHeader(Account, false)}
            />
            <Route exact path="/login" component={withHeader(Login, false)} />
            <Route
                exact
                path="/sign-in-redirect"
                component={withHeader(SignInRedirect, false)}
            />
            <Route
                path="/dataset/:datasetId/distribution/:distributionId"
                component={withHeader(RecordHandler, true)}
            />
            {config.featureFlags.cataloguing && (
                <Route
                    exact
                    path="/dataset/new"
                    component={withHeader(NewDataset, false)}
                />
            )}
            <Route
                path="/dataset/:datasetId"
                component={withHeader(RecordHandler, true)}
            />
            <Route
                exact
                path="/suggest"
                component={withHeader(SuggestDataset, true)}
            />
            <Redirect
                from="/page/dataset-quality"
                to="/page/linked-data-rating"
            />
            <Route
                path="/page/:pageId"
                component={withHeader(StaticPage, true)}
            />
            <Route
                exact
                path="/404"
                component={withHeader(RouteNotFound, true)}
            />
            <Route
                exact
                path="/error"
                component={withHeader(ErrorPage, true)}
            />
            <FallbackRouteHandler />
        </Switch>
    );
};
export default OtherPages;
