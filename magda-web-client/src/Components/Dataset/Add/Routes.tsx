import React from "react";
import { Route, Switch } from "react-router-dom";

import DatasetAddPage from "Components/Dataset/Add/DatasetAddPage";
import DatasetAddFilesPage from "Components/Dataset/Add/DatasetAddFilesPage";
import DatasetListPage from "Components/Dataset/Add/DatasetListPage";
import DatasetAddMetadataPage from "Components/Dataset/Add/DatasetAddMetadataPage";

const Routes = () => {
    return (
        <Switch>
            <Route exact path="/dataset/add" component={DatasetAddPage} />
            <Route
                exact
                path="/dataset/add/files"
                component={DatasetAddFilesPage}
            />
            <Route
                path="/dataset/add/files/:dataset"
                component={DatasetAddFilesPage}
            />
            <Route exact path="/dataset/list" component={DatasetListPage} />
            <Route exact path="/dataset/add/urls" component={DatasetAddPage} />
            <Route
                path="/dataset/add/metadata/:dataset/:step"
                component={DatasetAddMetadataPage}
            />
            <Route exact path="/dataset/add/bulk" component={DatasetAddPage} />
        </Switch>
    );
};
export default Routes;
