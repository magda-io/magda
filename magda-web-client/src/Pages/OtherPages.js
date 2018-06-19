import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import Search from "../Components/Search/Search";
import Account from "../Components/Account/Account";
import Login from "../Components/Account/Login";
import SignInRedirect from "../Components/Account/SignInRedirect";
import RecordHandler from "../Components/RecordHandler";
import ProjectsViewer from "../Components/Project/ProjectsViewer";
import ProjectDetails from "../Components/Project/ProjectDetails";
import CreateProject from "../Components/Project/CreateProject";
import OrganisationsViewer from "../Components/Organisation/OrganisationsViewer";
import OrganisationDetails from "../Components/Organisation/OrganisationDetails";
import { staticPageRegister } from "../content/register";
import RouteNotFound from "../Components/RouteNotFound";
import SuggestDataset from "../Components/RequestDataset/SuggestDataset";
import Header from "../Components/Header/Header";
import SearchBoxSwitcher from "../Components/SearchBox/SearchBoxSwitcher";
import { enableSuggestDatasetPage } from "../config";

import "./OtherPages.css";

const renderBody = () => {
    return (
        <Switch>
            <Route exact path="/search" component={Search} />
            <Route exact path="/account" component={Account} />
            <Route exact path="/login" component={Login} />
            <Route exact path="/sign-in-redirect" component={SignInRedirect} />
            <Route
                path="/dataset/:datasetId/distribution/:distributionId"
                component={RecordHandler}
            />
            <Route path="/dataset/:datasetId" component={RecordHandler} />
            <Route exact path="/projects" component={ProjectsViewer} />
            <Route exact path="/projects/new" component={CreateProject} />
            <Route path="/projects/:projectId" component={ProjectDetails} />
            {/* hide in prod */}
            {enableSuggestDatasetPage && (
                <Route exact path="/suggest" component={SuggestDataset} />
            )}
            <Route
                exact
                path="/organisations"
                component={OrganisationsViewer}
            />
            <Route
                exact
                path="/organisations"
                render={() => <Redirect to="/organisations" />}
            />
            <Route
                path="/organisations/:organisationId"
                component={OrganisationDetails}
            />
            {staticPageRegister.map(item => (
                <Route
                    path={`/page/:id`}
                    key={item.path}
                    component={item.component}
                />
            ))}
            <Route exact path="/404" component={RouteNotFound} />
            <Route path="/*" component={RouteNotFound} />
        </Switch>
    );
};

const OtherPages = props => {
    return (
        <div className="other-page">
            <Header />
            {props.location.pathname !== "/organisations" && (
                <SearchBoxSwitcher
                    location={props.location}
                    theme="none-home"
                />
            )}
            <div className="container app-container" id="content">
                {renderBody()}
            </div>
        </div>
    );
};

export default OtherPages;
