import React, { FunctionComponent } from "react";
import SQLConsoleLoader from "./SQLConsoleLoader";
import { Route, Switch } from "react-router-dom";

const SQLConsoleRoutes: FunctionComponent = () => (
    <Switch>
        <Route path="/home" exact component={SQLConsoleLoader} />
        <Route path="/organisations(/)*(.)*" component={SQLConsoleLoader} />
        <Route path="/search" exact component={SQLConsoleLoader} />
        <Route path="/drafts" exact component={SQLConsoleLoader} />
        <Route path="/all-datasets" exact component={SQLConsoleLoader} />
        <Route
            path="/dataset/:datasetId/distribution/:distributionId"
            component={SQLConsoleLoader}
        />
        <Route path="/dataset/:datasetId" component={SQLConsoleLoader} />
        <Route path="/page/:pageId" component={SQLConsoleLoader} />
        <Route path="/error" exact component={SQLConsoleLoader} />
    </Switch>
);

export default SQLConsoleRoutes;
