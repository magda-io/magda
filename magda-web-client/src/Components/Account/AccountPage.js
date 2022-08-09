import React from "react";
import { Redirect } from "react-router-dom";
import "./AccountPage.scss";
import LoginArea from "./AccountLoginPage";
import { connect } from "react-redux";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";
import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import CommonLink from "Components/Common/CommonLink";

class Account extends React.Component {
    renderRoles() {
        const user = this.props.user;
        return (
            <div>
                Roles:{" "}
                {user.roles && user.roles.length ? (
                    <ul>{user.roles.map((role) => this.renderRole(role))}</ul>
                ) : (
                    "N/A"
                )}
            </div>
        );
    }

    renderRole(roleItem) {
        return (
            <li key={roleItem.id}>
                {roleItem.name}
                <div>Role Permissions: </div>
                {roleItem.permissionIds && roleItem.permissionIds.length ? (
                    <ul>
                        {roleItem.permissionIds.map((permissionId) =>
                            this.renderPermissionById(permissionId)
                        )}
                    </ul>
                ) : (
                    "N/A"
                )}
            </li>
        );
    }

    getPermissionById(permissionId) {
        const user = this.props.user;
        if (!user.permissions || !user.permissions.length) return null;
        for (let i = 0; i < user.permissions.length; i++) {
            if (user.permissions[i].id === permissionId)
                return user.permissions[i];
        }
        return null;
    }

    renderPermissionById(permissionId) {
        const permission = this.getPermissionById(permissionId);
        return (
            <li key={permissionId}>{permission ? permission.name : "N/A"}</li>
        );
    }

    render() {
        const pageTitle = this.props.user.id ? "Account" : "Sign In";
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
                    {this.props.user.id &&
                    this?.props?.location?.state?.signInError ? (
                        <div className="col-xs-12">
                            <div className="au-body au-page-alerts au-page-alerts--error">
                                <p>
                                    Error:{" "}
                                    {this.props.location.state.signInError}{" "}
                                </p>
                            </div>
                        </div>
                    ) : null}
                    {!this.props.user.id && (
                        <LoginArea
                            signInError={
                                this?.props?.location?.state?.signInError
                            }
                            redirectTo={
                                this?.props?.location?.state?.redirectTo
                            }
                        />
                    )}
                    {this.props.user.id && (
                        <div>
                            <Redirect to="/settings/account" />
                            <h1>Account</h1>
                            <p>Display Name: {this.props.user.displayName}</p>
                            {this.props.user.orgUnit && (
                                <p>
                                    Organisation Unit:{" "}
                                    {this.props.user.orgUnit.name}
                                </p>
                            )}
                            <p>Email: {this.props.user.email}</p>
                            {this.renderRoles()}
                            {this.props.user.isAdmin && (
                                <CommonLink href="/admin" className="au-btn">
                                    Administrate
                                </CommonLink>
                            )}
                            {"  "}
                            <CommonLink href="/settings" className="au-btn">
                                System Settings
                            </CommonLink>
                        </div>
                    )}
                </div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    let {
        userManagement: { user }
    } = state;

    return {
        user
    };
}

export default connect(mapStateToProps)(Account);
