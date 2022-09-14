import React, { SyntheticEvent } from "react";
import { connect } from "react-redux";
import { NavLink, withRouter, RouteComponentProps } from "react-router-dom";
import { User } from "reducers/userManagementReducer";
import { config } from "../../config";
import urijs from "urijs";

type PropsType = {
    user: User;
    skipLink: boolean;
};

class AccountNavbar extends React.Component<PropsType & RouteComponentProps> {
    signOut(event: SyntheticEvent) {
        event.preventDefault();
        const authApiUri = urijs(config.authApiUrl);
        const authApiSeqments = authApiUri
            .segmentCoded()
            .filter((item) => !!item);
        window.location.href = authApiUri
            .segmentCoded(
                authApiSeqments
                    .slice(
                        0,
                        authApiSeqments.length - 3 >= 0
                            ? authApiSeqments.length - 3
                            : 0
                    )
                    .concat(["auth", "logout"])
            )
            .search({
                redirect: config.baseExternalUrl
            })
            .toString();
        return false;
    }

    render() {
        const menu: JSX.Element[] = [];
        if (this.props?.user?.id) {
            menu.push(
                <li
                    key="/settings/account"
                    id={this.props.skipLink ? "nav" : undefined}
                >
                    <NavLink to={`/settings/account`}>
                        <span>Settings</span>
                    </NavLink>
                </li>
            );
            menu.push(
                <li key="/signOut">
                    <a href="#logout" onClick={this.signOut.bind(this)}>
                        <span>Sign Out</span>
                    </a>
                </li>
            );
        } else {
            menu.push(
                <li key="/account">
                    <NavLink
                        to={`/account`}
                        id={this.props.skipLink ? "nav" : undefined}
                    >
                        <span>Sign In</span>
                    </NavLink>
                </li>
            );
        }
        return menu;
    }
}

function mapStateToProps(state) {
    const { userManagement } = state;

    return {
        user: userManagement.user
    };
}

// This component is connected to redux via connect, and is not a route component,
// therefore does not get updated when location change
// we need to explicitly make it update by wrapping it in `withRouter`
export default withRouter(connect(mapStateToProps)(AccountNavbar));
