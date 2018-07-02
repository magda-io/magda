import React from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router-dom";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import Message from "./Message";
import EntryBox from "./EntryBox";
import { fetchMessages, sendNewMessage } from "../../actions/discussionActions";
import "draft-js-mention-plugin/lib/plugin.css";
import "./CrappyChat.css";

class CrappyChat extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            messages: []
        };
    }

    UNSAFE_componentWillMount() {
        this.setup(this.props);
    }

    UNSAFE_componentWillReceiveProps(newProps) {
        this.setup(newProps);
    }

    setup(props) {
        const discussion =
            props.discussionsLookup[props.typeName + "|" + props.typeId];

        if (!discussion) {
            props.fetchMessages(props.typeName, props.typeId);
        }

        this.setState({
            messages: (discussion && discussion.messages) || []
        });
    }

    _newChat(message) {
        this.props.sendNewMessage(
            this.props.typeName,
            this.props.typeId,
            message,
            this.props.user
        );
    }

    registerMessagesDiv(messagesRef) {
        this.messagesDiv = ReactDOM.findDOMNode(messagesRef);

        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.messagesDiv) {
            this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
        }
    }

    render() {
        return (
            <div className="white-box">
                <div
                    ref={this.registerMessagesDiv.bind(this)}
                    className="crappy-chat__messages"
                >
                    {this.state.messages.length === 0 && (
                        <span>Be the first to comment!</span>
                    )}

                    {this.state.messages.map((message, index) => {
                        return (
                            <Message
                                key={message.id || index}
                                message={message}
                            />
                        );
                    })}
                </div>
                <div className="crappy-chat__footer">
                    {this.props.user && (
                        <EntryBox onSubmit={this._newChat.bind(this)} />
                    )}

                    {!this.props.user && (
                        <div className="sign-in-prompt">
                            <Link
                                to={{
                                    pathname: "/account",
                                    state: { from: this.props.location }
                                }}
                            >
                                Sign in
                            </Link>{" "}
                            to join the discussion!
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    let {
        discussions: { discussions: discussionsLookup = {} },
        userManagement: { user }
    } = state;

    return {
        discussionsLookup,
        user
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchMessages,
            sendNewMessage
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(CrappyChat);
