import React, { Component } from "react";
import { withRouter } from "react-router-dom";
import Spinner from "Components/Common/Spinner";
import { connect } from "react-redux";
import { isAdmin } from "../RequireAdmin";
import { readContent, updateContent } from "actions/contentActions";
import CommonLink from "Components/Common/CommonLink";

class ContentEditPage extends Component<any, any> {
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
                (item) => {
                    this.updateState({ item });
                }
            );
        }
    }

    save(field) {
        return (value) => {
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
                        <CommonLink href={manageLink}>{manageText}</CommonLink>
                    </p>
                )}
            </React.Fragment>
        );
    }
}

function mapStateToProps(state, old) {
    const itemId = old.match.params.id;
    const hasEditPermissions =
        state.userManagement && isAdmin(state.userManagement.user);
    return {
        strings: state.content.strings,
        itemId,
        hasEditPermissions
    };
}

export default withRouter(connect(mapStateToProps)(ContentEditPage));
