import React from 'react';
import './Account.css';
import firebaseui from 'firebaseui';
import 'firebaseui/dist/firebaseui.css';
import base from '../Base';
import {config} from '../config.js';
import ReactDocumentTitle from 'react-document-title';

const authUi = new firebaseui.auth.AuthUI(base.auth());

export default class Account extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      user: base.auth().currentUser
    };
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

    this.unsubscribeDiscussionsListener = base.listenTo(
      `dataset-discussions/${this.props.datasetId}`,
      {
        context: this,
        asArray: true,
        then: comments => {
          this.setState({
            comments: comments
          });
        }
      }
    );

    this.unsubscribeOnAuthChanged = base.auth().onAuthStateChanged(user => {
      console.log(arguments);

      if (user) {
        this.setState({ user });
      } else {
        this.setState({ user: null });
      }
    });

    authUi.start('#firebaseui-auth', uiConfig);
  }

  componentWillUnmount() {
    authUi.reset();
    this.unsubscribeOnAuthChanged();
  }

  render() {
    const title = this.state.user ? 'Sign in ' : 'Sign up';
    return (
      <ReactDocumentTitle title={title + ' | ' + config.appName}>
      <div className='container account'>
        <h2>Account</h2>
        {!this.state.user && (
          <div id='firebaseui-auth' />
        )}
        {this.state.user && (
          <div>
            <p>Display Name: {this.state.user.displayName}</p>
            <p>Email: {this.state.user.email}</p>
          </div>
        )}
      </div>
      </ReactDocumentTitle>
    );
  }
}
