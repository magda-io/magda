import React from "react";
import ReactDOM from "react-dom";
import Editor from "draft-js-plugins-editor";
import { fromJS } from "immutable";
import { Editor as DraftEditor, EditorState, ContentState } from "draft-js";
import { Link } from "react-router";
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

  componentWillMount() {
    this.setup(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setup(newProps);
  }

  setup(props) {
    const discussion = props.discussionsLookup[props.discussionId];

    if (!discussion) {
      props.fetchMessages(props.discussionId);
    }

    this.setState({
      messages: (discussion && discussion.messages) || []
    });
  }

  _newChat(message) {
    this.props.sendNewMessage(this.props.discussionId, message, this.props.user);
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
      <div>
        <div
          ref={this.registerMessagesDiv.bind(this)}
          className='crappy-chat__messages white-box'
        >
          {this.state.messages.length === 0 &&
            <span>Be the first to comment!</span>
          }

          {this.state.messages.map((message, index) => {
            return <Message key={message.id || index} message={message} />;
          })}
        </div>

        {this.props.user && <EntryBox onSubmit={this._newChat.bind(this)} />}

        {!this.props.user &&
          <div><Link to="/account">Sign in</Link> to join the discussion!</div>}
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

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {
      fetchMessages,
      sendNewMessage
    },
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(CrappyChat);
