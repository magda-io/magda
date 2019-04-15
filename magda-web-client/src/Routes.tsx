import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import HomePage from "Components/Home/HomePage";
import AccountPage from "Components/Account/AccountPage";
import AccountLoginPage from "Components/Account/AccountLoginPage";
import AccountSignInRedirectPage from "Components/Account/AccountSignInRedirectPage";
import DatasetsSearchPage from "Components/Dataset/DatasetsSearchPage";
import DatasetPage from "Components/Dataset/DatasetPage";
import DatasetSuggestPage from "Components/Dataset/DatasetSuggestPage";

import ErrorPage from "Components/Error/ErrorPage";
import FallbackRouteHandlerPage from "Components/Error/FallbackRouteHandlerPage";
import RouteNotFoundPage from "Components/Error/RouteNotFoundPage";
import OrganisationsPage from "Components/Organisation/OrganisationsPage";
import OrganisationPage from "Components/Organisation/OrganisationPage";

import withHeader from "Components/Header/withHeader";
import { makeAsync } from "Components/AsyncComponent";

const AccountsManagePage = makeAsync(() =>
    import("Components/Account/AccountsManagePage").then(
        module => module.default
    )
);

const ConnectorsAdminPage = makeAsync(() =>
    import("Components/Dataset/ConnectorsAdminPage").then(
        module => module.default
    )
);

const HeaderNavigationManagePage = makeAsync(() =>
    import("Components/Header/HeaderNavigationManagePage").then(
        module => module.default
    )
);
const FooterNavigationManagePage = makeAsync(() =>
    import("Components/Footer/FooterNavigationManagePage").then(
        module => module.default
    )
);
const FooterNavigationLinksManagePage = makeAsync(() =>
    import("Components/Footer/FooterNavigationLinksManagePage").then(
        module => module.default
    )
);
const FooterCopyrightManagePage = makeAsync(() =>
    import("Components/Footer/FooterCopyrightManagePage").then(
        module => module.default
    )
);

const HomeHighlightsManage = makeAsync(() =>
    import("Components/Home/HighlightsManagePage").then(
        module => module.default
    )
);

const HomeAdminPage = makeAsync(() =>
    import("Components/Home/HomeAdminPage").then(module => module.default)
);
const DatasetAddPage = makeAsync(() =>
    import("Components/Dataset/DatasetAddPage").then(module => module.default)
);
const StaticPage = makeAsync(() =>
    import("Components/Static/StaticPage").then(module => module.default)
);
const ManageStaticPagesPage = makeAsync(() =>
    import("Components/Static/ManageStaticPagesPage").then(
        module => module.default
    )
);
const StoriesManagePage = makeAsync(() =>
    import("Components/Home/StoriesManagePage").then(module => module.default)
);
const StoriesEditPage = makeAsync(() =>
    import("Components/Home/StoriesEditPage").then(module => module.default)
);

const LanguageManagementPage = makeAsync(() =>
    import("Components/i18n/LanguageManagementPage").then(
        module => module.default
    )
);

import { config } from "./config";

const Routes = () => {
    return (
        <Switch>
            <Route exact path="/" component={HomePage} />
            <Route
                exact
                path="/admin/home"
                component={withHeader(HomeAdminPage, true)}
            />
            <Route
                exact
                path="/header/navigation"
                component={withHeader(HeaderNavigationManagePage, true)}
            />
            <Route
                path="/footer/navigation/:size"
                component={withHeader(FooterNavigationManagePage, true)}
            />
            <Route
                path="/footer/navigation-links/:size/:category"
                component={withHeader(FooterNavigationLinksManagePage, true)}
            />
            <Route
                exact
                path="/footer/copyright"
                component={withHeader(FooterCopyrightManagePage, true)}
            />
            <Route
                exact
                path="/connectors"
                component={withHeader(ConnectorsAdminPage, true)}
            />
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
                component={withHeader(DatasetsSearchPage, true)}
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
                path="/accounts"
                component={withHeader(AccountsManagePage, false)}
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
                path="/pages"
                component={withHeader(ManageStaticPagesPage, false)}
            />
            <Route
                exact
                path="/stories"
                component={withHeader(StoriesManagePage, false)}
            />
            <Route
                exact
                path="/i18n"
                component={withHeader(LanguageManagementPage, false)}
            />
            <Route
                exact
                path="/admin/home/highlights"
                component={withHeader(HomeHighlightsManage, false)}
            />
            <Route
                path="/stories/:id"
                component={withHeader(StoriesEditPage, true)}
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
