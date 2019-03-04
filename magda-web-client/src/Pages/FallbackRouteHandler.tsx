import React from "react";
import { Route } from "react-router-dom";
import { connect } from "react-redux";

import RouteNotFound from "../Components/RouteNotFound";
import Loading from "../Components/Loading";
import withHeader from "./withHeader";

type Props = {
    loading: boolean;
};

function FallbackRouteHandler({ loading }: Props) {
    return loading ? (
        <Loading />
    ) : (
        <Route path="/*" component={withHeader(RouteNotFound, true)} />
    );
}

const mapStateToProps = state => {
    const loading = !state.content.isFetched;
    return {
        loading
    };
};

export default connect(mapStateToProps)(FallbackRouteHandler);
