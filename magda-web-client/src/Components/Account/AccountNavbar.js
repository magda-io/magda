import React from "react";
import { connect } from "react-redux";
import { NavLink, withRouter } from "react-router-dom";
import { bindActionCreators } from "redux";
import { requestSignOut } from "actions/userManagementActions";

class AccountNavbar extends React.Component {
    signOut(event) {
        event.preventDefault();
        this.props.requestSignOut();
    }

    render() {
        let menu = [];
        if (this.props.user.id) {
            menu.push(
                <li key="/account" id={this.props.skipLink ? "nav" : undefined}>
                    <NavLink to={`/account`}>
                        <span>{this.props.user.displayName}</span>
                    </NavLink>
                </li>
            );
            if (this.props.user.isAdmin) {
                menu.push(
                    <li
                        key="/admin"
                        id={this.props.skipLink ? "nav" : undefined}
                    >
                        <NavLink to={`/admin`}>
                            <span>Admin</span>
                        </NavLink>
                    </li>
                );
            }
            menu.push(
                <li key="/signOut">
                    <button
                        className="link-button"
                        href="/signout"
                        onClick={this.signOut.bind(this)}
                    >
                        <span>Sign Out</span>
                    </button>
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
    let { userManagement } = state;

    return {
        user: userManagement.user
    };
}

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            requestSignOut
        },
        dispatch
    );
};

// This component is connected to redux via connect, and is not a route component,
// therefore does not get updated when location change
// we need to explicitly make it update by wrapping it in `withRouter`
export default withRouter(
    connect(mapStateToProps, mapDispatchToProps)(AccountNavbar)
);
