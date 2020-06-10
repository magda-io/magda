import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import { createId } from "./DatasetAddCommon";
import withHeader from "Components/Header/withHeader";
import DatasetAddPage from "Components/Dataset/Add/DatasetAddPage";
import DatasetListPage from "Components/Dataset/Add/DatasetListPage";
import DatasetAddMetadataPage from "Components/Dataset/Add/DatasetAddMetadataPage";
import DatasetEditMetadataPage from "Components/Dataset/Edit/DatasetEditMetadataPage";

const Routes = () => {
    return (
        <Switch>
            <Route
                exact
                path="/dataset/add"
                component={withHeader(DatasetAddPage, {
                    noContainerClass: true
                })}
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
            <Redirect
                exact
                from="/dataset/add/metadata"
                to={`/dataset/add/metadata/${createId()}`}
            />
            <Route
                path="/dataset/add/metadata/:datasetId/:step?"
                component={withHeader(DatasetAddMetadataPage, {
                    includeDatasetPageProgressMeter: true
                })}
            />
            <Route
                exact
                path="/dataset/add/bulk"
                component={withHeader(DatasetAddPage)}
            />
            <Route
                path="/dataset/edit/:datasetId/:step?"
                component={withHeader(
                    DatasetEditMetadataPage,
                    {
                        includeDatasetPageProgressMeter: true
                    },
                    {
                        isEdit: true
                    }
                )}
            />
        </Switch>
    );
};
export default Routes;
