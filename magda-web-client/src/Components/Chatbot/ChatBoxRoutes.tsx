import React, { FunctionComponent } from "react";
import ChatBox from "./ChatBox";
import { Route, Switch } from "react-router-dom";

const ChatBoxRoutes: FunctionComponent = () => (
    <Switch>
        <Route path="/home" exact component={ChatBox} />
        <Route path="/organisations(/)*(.)*" component={ChatBox} />
        <Route path="/search" exact component={ChatBox} />
        <Route path="/drafts" exact component={ChatBox} />
        <Route path="/all-datasets" exact component={ChatBox} />
        <Route
            path="/dataset/:datasetId/distribution/:distributionId"
            component={ChatBox}
        />
        <Route path="/dataset/:datasetId" component={ChatBox} />
        <Route path="/page/:pageId" component={ChatBox} />
        <Route path="/error" exact component={ChatBox} />
    </Switch>
);

export default ChatBoxRoutes;
