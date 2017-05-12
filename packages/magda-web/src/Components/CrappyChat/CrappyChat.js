import React from "react";
import firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import ReactDOM from "react-dom";
import Editor from "draft-js-plugins-editor";
import { fromJS } from "immutable";
import { Editor as DraftEditor, EditorState, ContentState } from "draft-js";

import base from "./Base";
import Message from "./Message";
import EntryBox from "./EntryBox";
import "draft-js-mention-plugin/lib/plugin.css";
import "./CrappyChat.css";

const authUi = new firebaseui.auth.AuthUI(base.auth());

export default class CrappyChat extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      comments: [],
      user: base.auth().currentUser
    };
  }
  componentWillMount() {
    base.listenTo(`dataset-discussions/${this.props.datasetId}`, {
      context: this,
      asArray: true,
      then: comments => {
        this.setState({
          comments: comments
        });
      }
    });

    base.auth().onAuthStateChanged(user => {
      if (user) {
        this.setState({ user });
      } else {
        this.setState({ user: null });
      }
    });
  }

  componentDidMount() {
    var self = this;
    var uiConfig = {
      callbacks: {
        signInSuccess: function(user) {
          if (self.props.onSignIn) {
            self.props.onSignIn(user);
          }
          return false;
        }
      },
      signInOptions: [
        base.auth.GoogleAuthProvider.PROVIDER_ID,
        base.auth.EmailAuthProvider.PROVIDER_ID
      ]
    };
    authUi.start("#firebaseui-auth", uiConfig);
  }

  componentWillUnmount() {
    authUi.reset();
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

    base.push(`dataset-discussions/${this.props.datasetId}`, {
      data: {
        uid: this.state.user.uid,
        email: this.state.user.email,
        message
      },
      context: this,
      /*
       * This 'then' method will run after the
       * post has finished.
       */
      then: () => {
        console.log("POSTED");
        this.scrollToBottom();
      }
    });
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
        {!this.state.user && <div id="firebaseui-auth" />}

        <div
          ref={this.registerMessagesDiv.bind(this)}
          className="crappy-chat__messages"
        >
          {this.state.comments.map((comment, index) => {
            return <Message key={comment.key} comment={comment} />;
          })}
        </div>

        {this.state.user && <EntryBox onSubmit={this._newChat.bind(this)} />}
      </div>
    );
  }
}
