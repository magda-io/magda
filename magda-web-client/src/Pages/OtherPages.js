import React from "react";
import { Route, Switch } from "react-router-dom";
import Search from "../Components/Search/Search";
import Feedback from "../Components/Feedback";
import Contact from "../Components/Contact";
import Account from "../Components/Account/Account";
import Login from "../Components/Account/Login";
import SignInRedirect from "../Components/Account/SignInRedirect";
import RecordHandler from "../Components/RecordHandler";
import ProjectsViewer from "../Components/Project/ProjectsViewer";
import ProjectDetails from "../Components/Project/ProjectDetails";
import CreateProject from "../Components/Project/CreateProject";
import PublishersViewer from "../Components/Publisher/PublishersViewer";
import PublisherDetails from "../Components/Publisher/PublisherDetails";
import { staticPageRegister } from "../content/register";
import RouteNotFound from "../Components/RouteNotFound";

import Header from "../Components/Header/Header";
import SearchBoxSwitcher from "../Components/SearchBox/SearchBoxSwitcher";

const renderBody = () => {
    return (
        <Switch>
            <Route exact path="/search" component={Search} />
            <Route exact path="/feedback" component={Feedback} />
            <Route exact path="/contact" component={Contact} />
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
            <Route exact path="/publishers" component={PublishersViewer} />
            <Route
                path="/publishers/:publisherId"
                component={PublisherDetails}
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
            {props.location.pathname !== "/publishers" && (
                <SearchBoxSwitcher
                    location={props.location}
                    theme="none-home"
                />
            )}
            <div className="container app-container">{renderBody()}</div>
        </div>
    );
};

export default OtherPages;
