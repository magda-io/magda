import { Route } from "react-router-dom";
import { connect } from "react-redux";

import RouteNotFound from "../Components/RouteNotFound";
import Loading from "../Components/Loading";

type Props = {
    loading: boolean;
};

function FallbackRouteHandler({ loading }: Props) {
    {
        loading ? <Loading /> : <Route path="/*" component={RouteNotFound} />;
    }
}

const mapStateToProps = state => {
    const loading = !state.content.isFetched;
    return {
        loading
    };
};

export default connect(mapStateToProps)(FallbackRouteHandler);
