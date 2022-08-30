import React from "react";
import { Route } from "react-router-dom";
import { useSelector } from "react-redux";

import RouteNotFound from "Components/Error/RouteNotFoundPage";
import Loading from "Components/Common/Loading";
import withHeader from "Components/Header/withHeader";
import { StateType } from "reducers/reducer";

function FallbackRouteHandler() {
    const loading = useSelector<StateType, boolean>(
        (state) => !state?.content?.isFetched
    );

    return loading ? (
        <Loading />
    ) : (
        <Route
            path="/*"
            component={withHeader(RouteNotFound, { includeSearchBox: true })}
        />
    );
}

export default FallbackRouteHandler;
