import React from "react";
import { Route } from "react-router-dom";
import { connect } from "react-redux";

import RouteNotFound from "Components/Error/RouteNotFoundPage";
import Loading from "Components/Common/Loading";
import withHeader from "Components/Header/withHeader";

type Props = {
    loading: boolean;
};

function FallbackRouteHandler({ loading }: Props) {
    return loading ? (
        <Loading />
    ) : (
        <Route
            path="/*"
            component={withHeader(RouteNotFound, { includeSearchBox: true })}
        />
    );
}

const mapStateToProps = (state) => {
    const loading = !state.content.isFetched;
    return {
        loading
    };
};

export default connect(mapStateToProps)(FallbackRouteHandler);
