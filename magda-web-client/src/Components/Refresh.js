import React from "react";
import { Route } from "react-router-dom";

const Refresh = ({ path = "/" }) => (
    <Route
        path={path}
        component={({ history, location, match }) => {
            let refreshUrl = location.pathname.substring(match.path.length);
            if (refreshUrl === "") {
                refreshUrl = "/";
            }
            history.replace({
                ...location,
                pathname: refreshUrl
            });
            return null;
        }}
    />
);

export default Refresh;
