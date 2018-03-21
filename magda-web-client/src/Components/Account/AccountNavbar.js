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
            <div className="account-navbar">
                {this.props.user ? (
                    [
                        <span>
                            <Link to={`/account`}>
                                {this.props.user.displayName}
                            </Link>
                            <a href="" onClick={this.signOut.bind(this)}>
                                Sign Out
                            </a>
                        </span>
                    ]
                ) : (
                    <Link to={`/account`}>Sign in</Link>
                )}
            </div>
        );
    }
}

function mapStateToProps(state) {
    let { userManagement } = state;

    return {
        user: userManagement.user
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            requestSignOut
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNavbar);
