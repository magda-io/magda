import React from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import { bindActionCreators } from "redux";
import { requestSignOut } from "../../actions/userManagementActions";

class AccountNavbar extends React.Component {
    signOut(event) {
        event.preventDefault();
        this.props.requestSignOut();
    }

    render() {
        return (
            <ul className="nav navbar-nav navbar-account">
                {this.props.user ? (
                    [
                        <li key="user">
                            <Link to={`/account`}>
                                {this.props.user.displayName}
                            </Link>
                        </li>,
                        <li key="signout">
                            <a href="" onClick={this.signOut.bind(this)}>
                                Sign Out
                            </a>
                        </li>
                    ]
                ) : (
                    <li>
                        <Link to={`/account`}>Sign in</Link>
                    </li>
                )}
            </ul>
        );
    }
}

function mapStateToProps(state) {
    let { userManagement } = state;

    return {
        user: userManagement.user
    };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators(
        {
            requestSignOut
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNavbar);
