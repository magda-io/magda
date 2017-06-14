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
import { fetchMessages } from "../../actions/discussionActions";
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
    /*
     * Here, we call .post on the '/chats' ref
     * of our Firebase.  This will do a one-time 'set' on
     * that ref, replacing it with the data prop in the
     * options object.
     *
     * Keeping with the immutable data paradigm in React,
     * you should never mutate, but only replace,
     * the data in your Firebase (ie, use concat
     * to return a mutated copy of your state)
    */
    // base.push(`dataset-discussions/${this.props.datasetId}`, {
    //   data: {
    //     uid: this.props.user.uid,
    //     date: new Date().toISOString(),
    //     message
    //   },
    //   context: this,
    //   /*
    //    * This 'then' method will run after the
    //    * post has finished.
    //    */
    //   then: () => {
    //     console.log('POSTED');
    //     this.scrollToBottom();
    //   }
    // });
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
          className="crappy-chat__messages"
        >
          {this.state.messages.map((comment, index) => {
            return <Message key={comment.key} comment={comment} />;
          })}
        </div>

        {this.props.user && <EntryBox onSubmit={this._newChat.bind(this)} />}

        {!this.props.user &&
          <div><Link to="sign-in">Sign in</Link> to join the discussion!</div>}
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
      fetchMessages
    },
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(CrappyChat);
