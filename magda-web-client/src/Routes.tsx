import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import HomePage from "Components/Home/HomePage";
import AccountPage from "Components/Account/AccountPage";
import AccountLoginPage from "Components/Account/AccountLoginPage";
import AccountSignInRedirectPage from "Components/Account/AccountSignInRedirectPage";
import DatasetsSearchPage from "Components/Dataset/DatasetsSearchPage";
import DatasetsSearchPageDraftOnly from "Components/Dataset/DatasetsSearchPageDraftOnly";
import DatasetsSearchPagePublishedOnly from "Components/Dataset/DatasetsSearchPagePublishedOnly";
import DatasetPage from "Components/Dataset/DatasetPage";
import DatasetSuggestPage from "Components/Dataset/DatasetSuggestPage";

import ErrorPage from "Components/Error/ErrorPage";
import FallbackRouteHandlerPage from "Components/Error/FallbackRouteHandlerPage";
import RouteNotFoundPage from "Components/Error/RouteNotFoundPage";
import OrganisationsPage from "Components/Organisation/OrganisationsPage";
import OrganisationPage from "Components/Organisation/OrganisationPage";

import withHeader from "Components/Header/withHeader";
import { makeAsync } from "Components/AsyncComponent";

const AdminPage = makeAsync(() =>
    import("Components/Admin/AdminPage").then(module => module.default)
);

const AccountsAdminPage = makeAsync(() =>
    import("Components/Account/AccountsAdminPage").then(
        module => module.default
    )
);

const ConnectorsAdminPage = makeAsync(() =>
    import("Components/Dataset/ConnectorsAdminPage").then(
        module => module.default
    )
);

const HeaderNavigationAdminPage = makeAsync(() =>
    import("Components/Header/HeaderNavigationAdminPage").then(
        module => module.default
    )
);
const FooterNavigationAdminPage = makeAsync(() =>
    import("Components/Footer/FooterNavigationAdminPage").then(
        module => module.default
    )
);
const FooterNavigationLinksAdminPage = makeAsync(() =>
    import("Components/Footer/FooterNavigationLinksAdminPage").then(
        module => module.default
    )
);
const FooterCopyrightAdminPage = makeAsync(() =>
    import("Components/Footer/FooterCopyrightAdminPage").then(
        module => module.default
    )
);

const HighlightsAdminPage = makeAsync(() =>
    import("Components/Home/HighlightsAdminPage").then(module => module.default)
);
const HomeAdminPage = makeAsync(() =>
    import("Components/Home/HomeAdminPage").then(module => module.default)
);
const StaticPage = makeAsync(() =>
    import("Components/Static/StaticPage").then(module => module.default)
);
const AdminStaticPagesPage = makeAsync(() =>
    import("Components/Static/StaticPagesAdminPage").then(
        module => module.default
    )
);
const StoriesAdminPage = makeAsync(() =>
    import("Components/Home/StoriesAdminPage").then(module => module.default)
);
const LanguageAdminPage = makeAsync(() =>
    import("Components/i18n/LanguageAdminPage").then(module => module.default)
);
const DatasetRoutes = makeAsync(() =>
    import("Components/Dataset/Add/Routes").then(module => module.default)
);
const CatalogRoutes = makeAsync(() =>
    import("Components/Catalog/Routes").then(module => module.default)
);

import { config } from "./config";

const Routes = () => {
    return (
        <Switch>
            <Route exact path="/" component={HomePage} />
            <Route
                exact
                path="/admin"
                component={withHeader(AdminPage, true)}
            />
            <Route
                exact
                path="/admin/home"
                component={withHeader(HomeAdminPage, true)}
            />
            <Route
                exact
                path="/admin/home-stories"
                component={withHeader(StoriesAdminPage, false)}
            />
            <Route
                exact
                path="/admin/home-highlights"
                component={withHeader(HighlightsAdminPage, false)}
            />
            <Route
                exact
                path="/admin/header-navigation"
                component={withHeader(HeaderNavigationAdminPage, true)}
            />
            <Route
                path="/admin/footer-navigation/:size"
                component={withHeader(FooterNavigationAdminPage, true)}
            />
            <Route
                path="/admin/footer-navigation-links/:size/:category"
                component={withHeader(FooterNavigationLinksAdminPage, true)}
            />
            <Route
                exact
                path="/admin/footer-copyright"
                component={withHeader(FooterCopyrightAdminPage, true)}
            />
            <Route
                exact
                path="/admin/connectors"
                component={withHeader(ConnectorsAdminPage, true)}
            />
            <Route
                exact
                path="/admin/accounts"
                component={withHeader(AccountsAdminPage, false)}
            />
            <Route
                exact
                path="/admin/pages"
                component={withHeader(AdminStaticPagesPage, false)}
            />
            <Route
                exact
                path="/admin/i18n"
                component={withHeader(LanguageAdminPage, false)}
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
                component={withHeader(DatasetsSearchPagePublishedOnly, true)}
            />
            <Route
                exact
                path="/drafts"
                component={withHeader(DatasetsSearchPageDraftOnly, true)}
            />
            <Route
                exact
                path="/all-datasets"
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
                    path="/catalog"
                    component={withHeader(CatalogRoutes, false)}
                />
            )}
            {/*
                We can't load header here. ProgressMeter needs to go into header
                but the first route of the dataset route doesn't need a ProgressMeter.
             */}
            {config.featureFlags.cataloguing && (
                <Route
                    path="/dataset/(add|list|edit)"
                    component={DatasetRoutes}
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
