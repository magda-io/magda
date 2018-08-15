import React from "react";
import "./Account.css";
import Login from "./Login";
import { connect } from "react-redux";
import { config } from "../../config";
import queryString from "query-string";
import { requestAuthProviders } from "../../actions/userManagementActions";
import ReactDocumentTitle from "react-document-title";
import { bindActionCreators } from "redux";
import Breadcrumbs from "../../UI/Breadcrumbs";
import { Medium } from "../../UI/Responsive";

class Account extends React.Component {
    constructor(props) {
        super(props);

        const params = queryString.parse(window.location.search);

        this.state = {
            signInError: params.signInError
        };
    }

    componentDidMount() {
        this.props.requestAuthProviders();
    }

    render() {
        const pageTitle = this.props.user ? "Account" : "Sign In";
        return (
            <ReactDocumentTitle title={`${pageTitle} | ${config.appName}`}>
                <div className="account">
                    <Medium>
                        <Breadcrumbs
                            breadcrumbs={[
                                <li key="account">
                                    <span>Acount</span>
                                </li>
                            ]}
                        />
                    </Medium>
                    {!this.props.user && (
                        <Login
                            signInError={
                                this.props.location.state &&
                                this.props.location.state.signInError
                            }
                            providers={this.props.providers}
                            location={this.props.location}
                        />
                    )}
                    {this.props.user && (
                        <div>
                            <h2>Account</h2>
                            <p>Display Name: {this.props.user.displayName}</p>
                            <p>Email: {this.props.user.email}</p>
                        </div>
                    )}
                </div>
            </ReactDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    let {
        userManagement: { user, providers, providersError }
    } = state;

    return {
        user,
        providers,
        providersError
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            requestAuthProviders
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Account);
