import React, { FunctionComponent } from "react";
import ChatBoxLaunchButton from "./ChatBoxLaunchButton";
import { Route, Switch } from "react-router-dom";
import { config } from "../../config";

const ChatBoxRoutes: FunctionComponent = () => (
    <>
        {config?.enableChatbot ? (
            <Switch>
                <Route path="/home" exact component={ChatBoxLaunchButton} />
                <Route
                    path="/organisations(/)*(.)*"
                    component={ChatBoxLaunchButton}
                />
                <Route path="/search" exact component={ChatBoxLaunchButton} />
                <Route path="/drafts" exact component={ChatBoxLaunchButton} />
                <Route
                    path="/all-datasets"
                    exact
                    component={ChatBoxLaunchButton}
                />
                <Route
                    path="/dataset/:datasetId/distribution/:distributionId"
                    component={ChatBoxLaunchButton}
                />
                <Route
                    path="/dataset/:datasetId"
                    component={ChatBoxLaunchButton}
                />
                <Route path="/page/:pageId" component={ChatBoxLaunchButton} />
                <Route path="/error" exact component={ChatBoxLaunchButton} />
            </Switch>
        ) : null}
    </>
);

export default ChatBoxRoutes;
