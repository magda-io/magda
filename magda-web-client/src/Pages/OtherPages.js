import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import Search from "../Components/Search/Search";
import Account from "../Components/Account/Account";
import Login from "../Components/Account/Login";
import SignInRedirect from "../Components/Account/SignInRedirect";
import RecordHandler from "../Components/RecordHandler";
import PublishersViewer from "../Components/Publisher/PublishersViewer";
import PublisherDetails from "../Components/Publisher/PublisherDetails";
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
            {/* hide in prod */}
            {enableSuggestDatasetPage && (
                <Route exact path="/suggest" component={SuggestDataset} />
            )}
            <Route exact path="/organisations" component={PublishersViewer} />
            <Route
                exact
                path="/publishers"
                render={() => <Redirect to="/organisations" />}
            />
            <Route
                path="/publishers/:publisherId"
                render={({ match }) => (
                    <Redirect
                        to={`/organisations/${match.params.publisherId}`}
                    />
                )}
            />
            <Route
                path="/organisations/:publisherId"
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
