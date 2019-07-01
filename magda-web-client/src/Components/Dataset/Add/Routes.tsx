import React from "react";
import { Route, Switch } from "react-router-dom";

import withHeader from "Components/Header/withHeader";
import DatasetAddPage from "Components/Dataset/Add/DatasetAddPage";
import DatasetAddFilesPage from "Components/Dataset/Add/DatasetAddFilesPage";
import DatasetListPage from "Components/Dataset/Add/DatasetListPage";
import DatasetAddMetadataPage from "Components/Dataset/Add/DatasetAddMetadataPage";

const Routes = () => {
    return (
        <Switch>
            <Route
                exact
                path="/dataset/add"
                component={withHeader(DatasetAddPage, false, false, true)}
            />
            <Route
                exact
                path="/dataset/add/files"
                component={withHeader(DatasetAddFilesPage, false, true)}
            />
            <Route
                path="/dataset/add/files/:dataset"
                component={withHeader(DatasetAddFilesPage, false, true)}
            />
            <Route
                exact
                path="/dataset/list"
                component={withHeader(DatasetListPage)}
            />
            <Route
                exact
                path="/dataset/add/urls"
                component={withHeader(DatasetAddPage)}
            />
            <Route
                path="/dataset/add/metadata/:dataset/:step"
                component={withHeader(DatasetAddMetadataPage, false, true)}
            />
            <Route
                exact
                path="/dataset/add/bulk"
                component={withHeader(DatasetAddPage)}
            />
        </Switch>
    );
};
export default Routes;
