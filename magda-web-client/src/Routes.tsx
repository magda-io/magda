import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import HomePage from "Components/Home/HomePage";
import AccountPage from "Components/Account/AccountPage";
import AccountLoginPage from "Components/Account/AccountLoginPage";
import AccountSignInRedirectPage from "Components/Account/AccountSignInRedirectPage";
import DatasetsSearchPageDraftOnly from "Components/Dataset/DatasetsSearchPageDraftOnly";
import DatasetsSearchPagePublishedOnly from "Components/Dataset/DatasetsSearchPagePublishedOnly";
import DatasetPage from "Components/Dataset/DatasetPage";
import DatasetSuggestPage from "Components/Dataset/DatasetSuggestPage";

import ErrorPage from "Components/Error/ErrorPage";
import FallbackRouteHandlerPage from "Components/Error/FallbackRouteHandlerPage";
import RouteNotFoundPage from "Components/Error/RouteNotFoundPage";
import OrganisationsPage from "Components/Organisation/OrganisationsPage";
import OrganisationPage from "Components/Organisation/OrganisationPage";
import StaticPage from "Components/Static/StaticPage";

import withHeader from "Components/Header/withHeader";
import { makeAsync } from "Components/AsyncComponent";

const DatasetAddPage = makeAsync(() =>
    import("Components/Dataset/DatasetAddPage").then(module => module.default)
);

import { config } from "./config";

const Routes = () => {
    return (
        <Switch>
            <Route exact path="/" component={HomePage} />
            <Route
                exact
                path="/organisations"
                component={withHeader(OrganisationsPage, false)}
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
                component={withHeader(OrganisationPage, false)}
            />
            <Route
                exact
                path="/search"
                component={withHeader(DatasetsSearchPagePublishedOnly, true)}
            />
            <Route
                exact
                path="/draft"
                component={withHeader(DatasetsSearchPageDraftOnly, true)}
            />
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
                component={withHeader(AccountPage, false)}
            />
            <Route
                exact
                path="/login"
                component={withHeader(AccountLoginPage, false)}
            />
            <Route
                exact
                path="/sign-in-redirect"
                component={withHeader(AccountSignInRedirectPage, false)}
            />
            <Route
                path="/dataset/:datasetId/distribution/:distributionId"
                component={withHeader(DatasetPage, true)}
            />
            {config.featureFlags.cataloguing && (
                <Route
                    exact
                    path="/dataset/new"
                    component={withHeader(DatasetAddPage, false)}
                />
            )}
            <Route
                path="/dataset/:datasetId"
                component={withHeader(DatasetPage, true)}
            />
            <Route
                exact
                path="/suggest"
                component={withHeader(DatasetSuggestPage, true)}
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
                component={withHeader(RouteNotFoundPage, true)}
            />
            <Route
                exact
                path="/error"
                component={withHeader(ErrorPage, true)}
            />
            <FallbackRouteHandlerPage />
        </Switch>
    );
};
export default Routes;
