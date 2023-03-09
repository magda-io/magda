import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
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
import ValidateUser from "Components/ValidateUser";

const Routes = () => {
    return (
        <ValidateUser>
            <>
                <ConfirmDialog />
                <Switch>
                    <Route exact path="/settings">
                        <Redirect to="/settings/account" />
                    </Route>
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
                </Switch>
            </>
        </ValidateUser>
    );
};
export default Routes;
