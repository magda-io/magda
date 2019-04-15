import React from "react";
import "./AccountPage.scss";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";

import { listUsers, updateUser } from "actions/userManagementActions";

class Account extends React.Component {
    state = {
        items: []
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        listUsers().then(users => this.updateState(users));
    }

    render() {
        const { items } = this.state;

        items.sort((a, b) => (a.displayName > b.displayName ? 1 : -1));

        return (
            <MagdaDocumentTitle prefixes={["Accounts"]}>
                <div>
                    <h1>Manage Accounts</h1>
                    {items.length === 0 ? (
                        <p>No users</p>
                    ) : (
                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Source</th>
                                        <th>Admin</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(this.renderUser.bind(this))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </MagdaDocumentTitle>
        );
    }

    renderUser(user) {
        const save = async patch => {
            await updateUser(user.id, patch);
            listUsers().then(users => this.updateState(users));
        };
        return (
            <tr>
                <td>
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        style={{
                            maxWidth: "50px",
                            maxHeight: "50px"
                        }}
                    />
                </td>
                <td>{user.displayName}</td>
                <td>{user.email}</td>
                <td>{user.source}</td>
                <td>
                    {user.isAdmin ? (
                        <button onClick={() => save({ isAdmin: false })}>
                            Unmake Admin
                        </button>
                    ) : (
                        <button onClick={() => save({ isAdmin: true })}>
                            Make Admin
                        </button>
                    )}
                </td>
            </tr>
        );
    }
}

export default Account;
