import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";

import HomePage from "Components/Home/HomePage";
import AccountPage from "Components/Account/AccountPage";
import AccountLoginPage from "Components/Account/AccountLoginPage";
import AccountSignInRedirectPage from "Components/Account/AccountSignInRedirectPage";
import DatasetsSearchPage from "Components/Dataset/DatasetsSearchPage";
import DatasetsSearchPageDraftOnly from "Components/Dataset/DatasetsSearchPageDraftOnly";
import DatasetsSearchPagePublishedOnly from "Components/Dataset/DatasetsSearchPagePublishedOnly";
import RecordHandler from "Components/Dataset/RecordHandler";
import DatasetSuggestPage from "Components/Dataset/DatasetSuggestPage";

import ErrorPage from "Components/Error/ErrorPage";
import FallbackRouteHandlerPage from "Components/Error/FallbackRouteHandlerPage";
import RouteNotFoundPage from "Components/Error/RouteNotFoundPage";
import OrganisationsPage from "Components/Organisation/OrganisationsPage";
import OrganisationPage from "Components/Organisation/OrganisationPage";

import withHeader from "Components/Header/withHeader";
import { makeAsync } from "Components/AsyncComponent";
import { config } from "./config";

import RequireAdmin from "./Components/RequireAdmin";
import LandingPage from "./Components/LandingPage";

const AdminPage = makeAsync(() =>
    import("Components/Admin/AdminPage").then((module) => module.default)
);

const AccountsAdminPage = makeAsync(() =>
    import("Components/Account/AccountsAdminPage").then(
        (module) => module.default
    )
);

const ConnectorsAdminPage = makeAsync(() =>
    import("Components/Dataset/ConnectorsAdminPage").then(
        (module) => module.default
    )
);

const HeaderNavigationAdminPage = makeAsync(() =>
    import("Components/Header/HeaderNavigationAdminPage").then(
        (module) => module.default
    )
);
const FooterNavigationAdminPage = makeAsync(() =>
    import("Components/Footer/FooterNavigationAdminPage").then(
        (module) => module.default
    )
);
const FooterNavigationLinksAdminPage = makeAsync(() =>
    import("Components/Footer/FooterNavigationLinksAdminPage").then(
        (module) => module.default
    )
);
const FooterCopyrightAdminPage = makeAsync(() =>
    import("Components/Footer/FooterCopyrightAdminPage").then(
        (module) => module.default
    )
);

const HighlightsAdminPage = makeAsync(() =>
    import("Components/Home/HighlightsAdminPage").then(
        (module) => module.default
    )
);
const HomeAdminPage = makeAsync(() =>
    import("Components/Home/HomeAdminPage").then((module) => module.default)
);
const StaticPage = makeAsync(() =>
    import("Components/Static/StaticPage").then((module) => module.default)
);
const AdminStaticPagesPage = makeAsync(() =>
    import("Components/Static/StaticPagesAdminPage").then(
        (module) => module.default
    )
);
const StoriesAdminPage = makeAsync(() =>
    import("Components/Home/StoriesAdminPage").then((module) => module.default)
);
const LanguageAdminPage = makeAsync(() =>
    import("Components/i18n/LanguageAdminPage").then((module) => module.default)
);
const DatasetRoutes = makeAsync(() =>
    import("Components/Dataset/Add/Routes").then((module) => module.default)
);
const CatalogRoutes = makeAsync(() =>
    import("Components/Catalog/Routes").then((module) => module.default)
);

const SettingsRoutes = makeAsync(() =>
    import("Components/Settings/Routes").then((module) => module.default)
);

const Routes = () => {
    return (
        <Switch>
            <Route path="/" exact component={LandingPage} />
            <Route path="/home" exact component={HomePage} />
            <Route path="/settings(/)*(.)*" component={SettingsRoutes} />
            <Route
                exact
                path="/admin"
                component={RequireAdmin(
                    withHeader(AdminPage, { includeSearchBox: true })
                )}
            />
            <Route
                exact
                path="/admin/home"
                component={RequireAdmin(
                    withHeader(HomeAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                exact
                path="/admin/home-stories"
                component={RequireAdmin(withHeader(StoriesAdminPage))}
            />
            <Route
                exact
                path="/admin/home-highlights"
                component={RequireAdmin(withHeader(HighlightsAdminPage))}
            />
            <Route
                exact
                path="/admin/header-navigation"
                component={RequireAdmin(
                    withHeader(HeaderNavigationAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                path="/admin/footer-navigation/:size"
                component={RequireAdmin(
                    withHeader(FooterNavigationAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                path="/admin/footer-navigation-links/:size/:category"
                component={RequireAdmin(
                    withHeader(FooterNavigationLinksAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                exact
                path="/admin/footer-copyright"
                component={RequireAdmin(
                    withHeader(FooterCopyrightAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                exact
                path="/admin/connectors"
                component={RequireAdmin(
                    withHeader(ConnectorsAdminPage, {
                        includeSearchBox: true
                    })
                )}
            />
            <Route
                exact
                path="/admin/accounts"
                component={RequireAdmin(withHeader(AccountsAdminPage))}
            />
            <Route
                exact
                path="/admin/pages"
                component={RequireAdmin(withHeader(AdminStaticPagesPage))}
            />
            <Route
                exact
                path="/admin/i18n"
                component={RequireAdmin(withHeader(LanguageAdminPage))}
            />
            <Route
                exact
                path="/organisations"
                component={withHeader(OrganisationsPage)}
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
                component={withHeader(OrganisationPage)}
            />
            <Route
                exact
                path="/search"
                component={withHeader(DatasetsSearchPagePublishedOnly, {
                    includeSearchBox: true
                })}
            />
            <Route
                exact
                path="/drafts"
                component={withHeader(DatasetsSearchPageDraftOnly, {
                    includeSearchBox: true
                })}
            />
            <Route
                exact
                path="/all-datasets"
                component={withHeader(DatasetsSearchPage, {
                    includeSearchBox: true
                })}
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
            <Route exact path="/account" component={withHeader(AccountPage)} />
            <Route
                exact
                path="/login"
                component={withHeader(AccountLoginPage)}
            />
            <Route
                exact
                path="/sign-in-redirect"
                component={withHeader(AccountSignInRedirectPage)}
            />
            <Route
                path="/dataset/:datasetId/distribution/:distributionId"
                component={withHeader(RecordHandler as any, {
                    includeSearchBox: true
                })}
            />
            {config.featureFlags.cataloguing && (
                <Route path="/catalog" component={withHeader(CatalogRoutes)} />
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
                component={withHeader(RecordHandler as any, {
                    includeSearchBox: true
                })}
            />
            <Route
                exact
                path="/suggest"
                component={withHeader(DatasetSuggestPage, {
                    includeSearchBox: true
                })}
            />
            <Redirect
                from="/page/dataset-quality"
                to="/page/linked-data-rating"
            />
            <Route
                path="/page/:pageId"
                component={withHeader(StaticPage, { includeSearchBox: true })}
            />
            <Route
                exact
                path="/404"
                component={withHeader(RouteNotFoundPage, {
                    includeSearchBox: true
                })}
            />
            <Route
                exact
                path="/error"
                component={withHeader(ErrorPage, { includeSearchBox: true })}
            />
            <FallbackRouteHandlerPage />
        </Switch>
    );
};
export default Routes;
