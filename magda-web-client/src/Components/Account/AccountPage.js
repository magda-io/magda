import React from "react";
import "./AccountPage.scss";
import Login from "./AccountLoginPage";
import { connect } from "react-redux";
import queryString from "query-string";
import { requestAuthProviders } from "actions/userManagementActions";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import { bindActionCreators } from "redux";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";

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
            <MagdaDocumentTitle prefixes={[pageTitle]}>
                <div className="account">
                    <Medium>
                        <Breadcrumbs
                            breadcrumbs={[
                                <li key="account">
                                    <span>Account</span>
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
                            <h1>Account</h1>
                            <p>Display Name: {this.props.user.displayName}</p>
                            <p>Email: {this.props.user.email}</p>
                            <p>
                                Role:{" "}
                                {this.props.user.isAdmin
                                    ? "Admin"
                                    : "Data User"}
                            </p>
                            {this.props.user.isAdmin && (
                                <div>
                                    <h2>Administrate</h2>
                                    <ul>
                                        <li>
                                            <a href="/admin/home">Site</a>
                                        </li>
                                        <li>
                                            <a href="/stories">Home Stories</a>
                                        </li>
                                        <li>
                                            <a href="/pages">Other Pages</a>
                                        </li>
                                        <li>
                                            <a href="/header/navigation">
                                                Header Navigation
                                            </a>
                                        </li>
                                        <li>
                                            <a href="/footer/navigation/medium">
                                                Footer Navigation
                                            </a>
                                        </li>
                                        <li>
                                            <a href="/footer/copyright">
                                                Footer Copyright
                                            </a>
                                        </li>
                                        <li>
                                            <a href="/accounts">
                                                User Accounts
                                            </a>
                                        </li>
                                        <li>
                                            <a href="/i18n">Language</a>
                                        </li>
                                        <li>
                                            <a href="/connectors">Connectors</a>
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </MagdaDocumentTitle>
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
