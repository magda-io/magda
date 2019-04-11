import React, { Component } from "react";
import { withRouter } from "react-router";
import Spinner from "Components/Common/Spinner";
import { connect } from "react-redux";

import { readContent, updateContent } from "actions/contentActions";

class ContentEditPage extends Component {
    state = {
        item: null
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    componentDidMount() {
        this.refresh();
    }

    refresh() {
        if (this.props.itemId) {
            readContent(this.props.itemIdPrefix + this.props.itemId).then(
                item => {
                    this.updateState({ item });
                }
            );
        }
    }

    save(field) {
        return value => {
            updateContent(this.props.itemIdPrefix + this.props.itemId, {
                [field]: value
            }).then(this.refresh.bind(this));
        };
    }

    render() {
        const {
            itemIdPrefix,
            itemId,
            hasEditPermissions,
            manageText,
            manageLink
        } = this.props;

        const { item } = this.state;

        if (!item) {
            return <Spinner />;
        }

        return (
            <React.Fragment>
                {this.props.render(
                    itemIdPrefix + itemId,
                    item,
                    hasEditPermissions,
                    this.save.bind(this)
                )}
                {hasEditPermissions && (
                    <p>
                        <a href={manageLink}>{manageText}</a>
                    </p>
                )}
            </React.Fragment>
        );
    }
}

function mapStateToProps(state, old) {
    const itemId = old.match.params.id;
    const hasEditPermissions =
        state.userManagement &&
        state.userManagement.user &&
        state.userManagement.user.isAdmin;
    return {
        strings: state.content.strings,
        itemId,
        hasEditPermissions
    };
}

export default withRouter(connect(mapStateToProps)(ContentEditPage));
