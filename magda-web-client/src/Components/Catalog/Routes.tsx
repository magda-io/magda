import React from "react";
import { Route, Switch } from "react-router-dom";

import CatalogAddPage from "Components/Catalog/CatalogAddPage";

const Routes = () => {
    return (
        <Switch>
            <Route path="/catalog/add" component={CatalogAddPage} />
        </Switch>
    );
};
export default Routes;
