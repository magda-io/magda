import React from "react";
import { Route, Switch, Redirect, useLocation } from "react-router-dom";
import withHeader from "Components/Header/withHeader";
import "../../rsuite.scss";
import ConfirmDialog from "./ConfirmDialog";
import UsersPage from "./UsersPage";
import RolesPage from "./RolesPage";
import UserRolesPage from "./UserRolesPage";
import OrgUnitsPage from "./OrgUnitsPage";
import ResourcesPage from "./ResourcesPage";
import ResourceOperationsPage from "./OperationsPage";
import RegistryRecordsPage from "./RegistryRecordsPage";
import RolePermissionsPage from "./RolePermissionsPage";
import AccountPage from "./AccountPage";
import DatasetManagementPage from "./DatasetManagementPage";
import AccessGroupsPage from "./AccessGroupsPage";
import AccessGroupDetailsPage from "./AccessGroupDetailsPage";
import ValidateUser from "Components/ValidateUser";
import HeaderSettingsPage from "./Content/HeaderSettingsPage";
import FooterSettingsPage from "./Content/FooterSettingsPage";
import FooterCategoryLinksPage from "./Content/FooterCategoryLinksPage";
import LogoSettingsPage from "./Content/LogoSettingsPage";
import PagesSettingsPage from "./Content/PagesSettingsPage";
import HomeSettingsPage from "./Content/HomeSettingsPage";
import UiTextSettingsPage from "./Content/UiTextSettingsPage";
import AgentWorkspacePage from "./AgentWorkspacePage";
import RequireAdmin from "Components/RequireAdmin";
import { config } from "../../config";

function SettingsRedirect() {
    const location = useLocation();
    // preserve the query string if it exists
    return <Redirect to={`/settings/account${location.search}`} />;
}

function redirectTo(path: string) {
    return function RedirectWithQueryString() {
        const location = useLocation();
        // preserve the query string if it exists
        return <Redirect to={`${path}${location.search}`} />;
    };
}

const ContentSettingsRedirect = redirectTo("/settings/content/header");
const FooterSettingsRedirect = redirectTo("/settings/content/footer/medium");
const HomeSettingsRedirect = redirectTo("/settings/content/home/taglines");

const Routes = () => {
    return (
        <ValidateUser>
            <>
                <ConfirmDialog />
                <Switch>
                    <Route
                        exact
                        path="/settings"
                        component={SettingsRedirect}
                    />
                    <Route
                        exact
                        path="/settings/datasets(/)*(.)*"
                        component={withHeader(DatasetManagementPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/account(/)*(.)*"
                        component={withHeader(AccountPage, {
                            noContainerClass: true
                        })}
                    />
                    {config.featureFlags.agentWorkspace && (
                        <Route
                            exact
                            path="/settings/agent-workspace"
                            component={RequireAdmin(
                                withHeader(AgentWorkspacePage, {
                                    noContainerClass: true
                                })
                            )}
                        />
                    )}
                    <Route
                        exact
                        path="/settings/users"
                        component={withHeader(UsersPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/users/:userId/roles"
                        component={withHeader(UserRolesPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/users/:userId/roles/:roleId/permissions"
                        component={withHeader(RolePermissionsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/roles"
                        component={withHeader(RolesPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/roles/:roleId/permissions"
                        component={withHeader(RolePermissionsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/resources"
                        component={withHeader(ResourcesPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/resources/:resourceId/operations"
                        component={withHeader(ResourceOperationsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/orgUnits"
                        component={withHeader(OrgUnitsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/records"
                        component={withHeader(RegistryRecordsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/records/:recordId"
                        component={withHeader(RegistryRecordsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/accessGroups"
                        component={withHeader(AccessGroupsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/accessGroups/:groupId"
                        component={withHeader(AccessGroupDetailsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/accessGroups/:groupId/datasets"
                        component={withHeader(AccessGroupDetailsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/accessGroups/:groupId/users"
                        component={withHeader(AccessGroupDetailsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content"
                        component={ContentSettingsRedirect}
                    />
                    <Route
                        exact
                        path="/settings/content/header"
                        component={withHeader(HeaderSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/footer"
                        component={FooterSettingsRedirect}
                    />
                    <Route
                        exact
                        path="/settings/content/footer/:tab"
                        component={withHeader(FooterSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/footer/:size/categories/:categoryKey"
                        component={withHeader(FooterCategoryLinksPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/logos"
                        component={withHeader(LogoSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/pages"
                        component={withHeader(PagesSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/home"
                        component={HomeSettingsRedirect}
                    />
                    <Route
                        exact
                        path="/settings/content/home/:tab"
                        component={withHeader(HomeSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                    <Route
                        exact
                        path="/settings/content/ui-text"
                        component={withHeader(UiTextSettingsPage, {
                            noContainerClass: true
                        })}
                    />
                </Switch>
            </>
        </ValidateUser>
    );
};
export default Routes;
