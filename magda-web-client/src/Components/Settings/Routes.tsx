import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import { makeAsync } from "Components/AsyncComponent";
import withHeader from "Components/Header/withHeader";
import "rsuite/dist/rsuite.min.css";
import ConfirmDialog from "./ConfirmDialog";
//import Index from "./Index";

const UsersPage = makeAsync(() =>
    import("./UsersPage").then((module) => module.default)
);
const RolesPage = makeAsync(() =>
    import("./RolesPage").then((module) => module.default)
);
const UserRolesPage = makeAsync(() =>
    import("./UserRolesPage").then((module) => module.default)
);
const OrgUnitsPage = makeAsync(() =>
    import("./OrgUnitsPage").then((module) => module.default)
);
const ResourcesPage = makeAsync(() =>
    import("./ResourcesPage").then((module) => module.default)
);
const ResourceOperationsPage = makeAsync(() =>
    import("./OperationsPage").then((module) => module.default)
);
const RegistryRecordsPage = makeAsync(() =>
    import("./RegistryRecordsPage").then((module) => module.default)
);

const Routes = () => {
    return (
        <>
            <ConfirmDialog />
            <Switch>
                <Route exact path="/settings">
                    <Redirect to="/settings/users" />
                </Route>
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
                    path="/settings/roles"
                    component={withHeader(RolesPage, {
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
    );
};
export default Routes;
