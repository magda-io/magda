import React, { FunctionComponent } from "react";
import SQLConsole from "./SQLConsole";
import { Route, Switch } from "react-router-dom";

const SQLConsoleRoutes: FunctionComponent = () => (
    <Switch>
        <Route path="/home" exact component={SQLConsole} />
        <Route path="/organisations(/)*(.)*" component={SQLConsole} />
        <Route path="/search" exact component={SQLConsole} />
        <Route path="/drafts" exact component={SQLConsole} />
        <Route path="/all-datasets" exact component={SQLConsole} />
        <Route
            path="/dataset/:datasetId/distribution/:distributionId"
            component={SQLConsole}
        />
        <Route path="/dataset/:datasetId" component={SQLConsole} />
        <Route path="/page/:pageId" component={SQLConsole} />
        <Route path="/error" exact component={SQLConsole} />
    </Switch>
);

export default SQLConsoleRoutes;
