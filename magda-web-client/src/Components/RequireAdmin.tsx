import React from "react";
import { Redirect } from "react-router-dom";
import { connect } from "react-redux";
import memoize from "lodash/memoize";
import { ADMIN_ROLE_ID } from "../config";
import { withRouter } from "react-router-dom";
import { Location } from "history";

function mapStateToProps(state) {
    const {
        userManagement: { user, isFetchingWhoAmI }
    } = state;

    return {
        user,
        isFetchingWhoAmI
    };
}

function RequireAdmin(WrappedComponent) {
    const NewComponent = (props) => {
        const { user, isFetchingWhoAmI, location, ...restProps } = props;

        if (isFetchingWhoAmI) {
            return <>loading...</>;
        } else if (
            user?.id &&
            user?.roles?.findIndex((role) => role.id === ADMIN_ROLE_ID) !== -1
        ) {
            return <WrappedComponent {...restProps} />;
        } else {
            return (
                <Redirect
                    to={`/sign-in-redirect?result=failure&errorMessage=${encodeURIComponent(
                        `You don't have permission to access "${
                            (location as Location).pathname
                        }". Please sign-in with an account with sufficient permission and try again.`
                    )}`}
                />
            );
        }
    };
    return withRouter(connect(mapStateToProps)(NewComponent));
}

export default memoize(RequireAdmin);
