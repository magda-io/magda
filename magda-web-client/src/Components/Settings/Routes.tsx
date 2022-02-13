import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import withHeader from "Components/Header/withHeader";
import "rsuite/dist/rsuite.min.css";
import UsersPage from "./UsersPage";
import Index from "./Index";
//import withHeader from "Components/Header/withHeader";
///import DatasetAddPage from "Components/Dataset/Add/DatasetAddPage";

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
                path="/settings/roles"
                component={withHeader(Index, { noContainerClass: true })}
            />
            <Route
                exact
                path="/settings/resources"
                component={withHeader(Index, { noContainerClass: true })}
            />
            <Route
                exact
                path="/settings/orgUnits"
                component={withHeader(Index, { noContainerClass: true })}
            />
            <Route
                exact
                path="/settings/records"
                component={withHeader(Index, { noContainerClass: true })}
            />
        </Switch>
    );
};
export default Routes;
