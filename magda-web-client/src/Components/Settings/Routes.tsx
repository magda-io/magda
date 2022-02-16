import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import withHeader from "Components/Header/withHeader";
import "rsuite/dist/rsuite.min.css";
import UsersPage from "./UsersPage";
import RolesPage from "./RolesPage";
import UserRolesPage from "./UserRolesPage";
import OrgUnitsPage from "./OrgUnitsPage";
import ResourcesPage from "./ResourcesPage";
import RegistryRecordsPage from "./RegistryRecordsPage";
//import Index from "./Index";

const Routes = () => {
    return (
        <Switch>
            <Route exact path="/settings">
                <Redirect to="/settings/users" />
            </Route>
            <Route
                exact
                path="/settings/users"
                component={withHeader(UsersPage, { noContainerClass: true })}
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
                path="/settings/roles"
                component={withHeader(RolesPage, { noContainerClass: true })}
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
                path="/settings/orgUnits"
                component={withHeader(OrgUnitsPage, { noContainerClass: true })}
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
    );
};
export default Routes;
