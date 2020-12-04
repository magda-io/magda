import React, { FunctionComponent } from "react";
import { connect } from "react-redux";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { ADMIN_ROLE_ID } from "config";
import { getUsers, setAdmin, getUserRoles } from "api-clients/AuthApis";
import ErrorMessageBox from "Components/Common/ErrorMessageBox";
import AdminHeader from "Components/Admin/AdminHeader";
import "./AccountsAdminPage.scss";
import { User } from "reducers/userManagementReducer";

type AccountsAdminPagePropsType = {
    user: User;
};

const AccountsAdminPage: FunctionComponent<AccountsAdminPagePropsType> = (
    props
) => {
    const {
        result: users,
        loading: isUserLoading,
        error: userLoadingError
    } = useAsync(getUsers, []);

    if (users?.length) {
        users.sort((a, b) => (a.displayName > b.displayName ? 1 : -1));
    }

    return (
        <div className="account-admin-page">
            <AdminHeader title="Accounts" />
            {isUserLoading ? (
                <>Loading....</>
            ) : (
                <div>
                    <ErrorMessageBox
                        error={userLoadingError ? "" + userLoadingError : null}
                    />
                    <table className="account-grid">
                        <thead>
                            <tr>
                                <th>Image</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Source</th>
                                <th>Is Admin?</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users?.length ? (
                                users.map((user) => (
                                    <UserRow
                                        key={user.id}
                                        user={user}
                                        loggedInUser={props?.user}
                                    />
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} align="center">
                                        No User Found!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

type UserRowProps = {
    user: User;
    loggedInUser?: User;
};

const UserRow: FunctionComponent<UserRowProps> = ({ user, loggedInUser }) => {
    const updateAdmin = useAsyncCallback(
        async (user: User, isAdmin: boolean) => {
            const userId = user.id;
            await setAdmin(userId, isAdmin);
            // set data directly to user to refresh screen
            // this works because `useAsyncCallback` will trigger a redrew after the execution of this function
            user.isAdmin = isAdmin;
            user.roles = await getUserRoles(user.id);
        }
    );

    const isAdmin =
        user?.isAdmin &&
        user?.roles?.length &&
        user.roles.findIndex((r) => r.id === ADMIN_ROLE_ID) !== -1;

    return (
        <tr key={user.id}>
            <td>
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        style={{
                            maxWidth: "50px",
                            maxHeight: "50px"
                        }}
                    />
                ) : (
                    "N/A"
                )}
            </td>
            <td>{user.displayName}</td>
            <td>{user.email}</td>
            <td>{user.source}</td>
            <td>
                {updateAdmin.loading ? "Loading..." : isAdmin ? "YES" : "NO"}
            </td>
            <td>
                {updateAdmin.error ? (
                    <div className="error-messaging">
                        `Failed to Update Admin Role for the user: $
                        {"" + updateAdmin.error}`
                    </div>
                ) : null}

                {user.id === loggedInUser?.id ? (
                    <>N/A (Current Account)</>
                ) : isAdmin ? (
                    <button
                        className="au-btn"
                        onClick={() => updateAdmin.execute(user, false)}
                    >
                        Unmake Admin
                    </button>
                ) : (
                    <button
                        className="au-btn"
                        onClick={() => updateAdmin.execute(user, true)}
                    >
                        Make Admin
                    </button>
                )}
            </td>
        </tr>
    );
};

function mapStateToProps(state) {
    const { userManagement } = state;

    return {
        user: userManagement.user
    };
}

export default connect(mapStateToProps)(AccountsAdminPage);
