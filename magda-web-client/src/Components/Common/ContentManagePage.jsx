import React, { Component } from "react";
import { Redirect } from "react-router-dom";
import { Link } from "react-router-dom";
import { connect } from "react-redux";

import Reveal from "Components/Common/Reveal";
import Spinner from "Components/Common/Spinner";
import MagdaDocumentTitle from "Components/i18n/MagdaDocumentTitle";

import {
    createContent,
    listContent,
    deleteContent
} from "actions/contentActions";
import humanFileSize from "helpers/humanFileSize";

class ManageContentPage extends Component {
    state = {
        newId: "",
        newIdValid: false,
        newIdAdded: false,
        deleteId: "",
        list: [],
        listLoading: true
    };

    refresh() {
        listContent(this.props.pattern).then(list => {
            list.sort((a, b) => {
                a = (a.content && a.content.order) || 0;
                b = (b.content && b.content.order) || 0;
                return a - b;
            });
            this.updateState({ list, listLoading: false });
        });
    }

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        this.refresh();
    }

    newIdChange(e) {
        const value = e.target.value;
        if (value.match(/^[a-z0-9-]*$/)) {
            this.updateState({ newId: value, newIdValid: !!value });
        }
    }

    async addNew(e) {
        let newId = this.props.generateNewId(
            (this.props.newIdInput && this.state.newId) || ""
        );

        await createContent(newId, this.props.newContent);

        this.updateState({ newId: "", newIdValid: false, newIdAdded: newId });
    }

    async deleteItemConfirm(id) {
        await deleteContent(id);
        this.refresh();
    }

    async deleteItem(id) {
        this.updateState({ deleteId: id });
    }

    render() {
        const {
            title,
            itemTitle,
            newIdInput,
            hasEditPermissions,
            link,
            titleFromItem
        } = this.props;

        const {
            newId,
            newIdValid,
            newIdAdded,
            deleteId,
            list,
            listLoading
        } = this.state;
        const canAddNew = !newIdInput || newIdValid;

        if (!hasEditPermissions) {
            return <span>For admins only</span>;
        }
        if (listLoading) {
            return <Spinner />;
        }

        return (
            <MagdaDocumentTitle prefixes={[title]}>
                <div>
                    <h1>{title}</h1>

                    {list.length === 0 ? (
                        <p>No {itemTitle} fround.</p>
                    ) : (
                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>{itemTitle}</th>
                                        <th>Size</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map(item => {
                                        return (
                                            <tr>
                                                <td>{titleFromItem(item)}</td>
                                                <td>
                                                    {humanFileSize(item.length)}
                                                </td>
                                                <td>
                                                    <Link to={link(item.id)}>
                                                        View
                                                    </Link>{" "}
                                                    {item.id === deleteId ? (
                                                        <div className="au-body au-page-alerts au-page-alerts--warning">
                                                            <div>
                                                                Do you really
                                                                want to delete
                                                                this item?
                                                            </div>
                                                            <div>
                                                                <button
                                                                    className="au-btn"
                                                                    onClick={this.deleteItemConfirm.bind(
                                                                        this,
                                                                        item.id
                                                                    )}
                                                                >
                                                                    Yes
                                                                </button>{" "}
                                                                <button
                                                                    className="au-btn au-btn--secondary"
                                                                    onClick={this.deleteItem.bind(
                                                                        this,
                                                                        ""
                                                                    )}
                                                                >
                                                                    No
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Link
                                                            to="#"
                                                            onClick={this.deleteItem.bind(
                                                                this,
                                                                item.id
                                                            )}
                                                        >
                                                            Delete
                                                        </Link>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div>
                        <Reveal label={`Add New ${itemTitle}`}>
                            <h2>Add New {itemTitle}</h2>
                            <div>
                                {newIdInput && (
                                    <React.Fragment>
                                        <p>
                                            <label htmlFor="inputId">
                                                Please insert an id for the{" "}
                                                {itemTitle.toLowerCase()}. It
                                                must be all lowercase and only
                                                consist of alphanumeric
                                                characters and dash.
                                            </label>
                                        </p>
                                        <input
                                            id="inputId"
                                            className="au-text-input"
                                            value={newId}
                                            required
                                            pattern="[a-z0-9-]+"
                                            onChange={this.newIdChange.bind(
                                                this
                                            )}
                                        />
                                    </React.Fragment>
                                )}
                                {canAddNew && (
                                    <button
                                        class="au-btn"
                                        onClick={this.addNew.bind(this)}
                                    >
                                        Add {itemTitle}
                                    </button>
                                )}
                            </div>
                            {newIdAdded && <Redirect to={link(newIdAdded)} />}
                        </Reveal>
                    </div>
                </div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state, old) {
    const hasEditPermissions =
        state.userManagement &&
        state.userManagement.user &&
        state.userManagement.user.isAdmin;
    return {
        strings: state.content.strings,
        hasEditPermissions
    };
}

export default connect(mapStateToProps)(ManageContentPage);
