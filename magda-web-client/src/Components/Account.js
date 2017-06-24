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
    debugger
    return (
      <ReactDocumentTitle title={title + ' | ' + config.appName}>
      <div className='container account'>
        <h2>Account details</h2>
        {!this.state.user && (
          <div id='firebaseui-auth' />
        )}
        {this.state.user && (
          <div className='media'>
            <div className='media-left'>
              <img className='media-object' alt={this.state.user.displayName} src={this.state.user.photoURL}/>
            </div>
            <div className='meida-body'>
              <div className='media-heading'>Display Name: {this.state.user.displayName}</div>
              <p>Email: {this.state.user.email}</p>
            </div>
          </div>
        )}
      </div>
      </ReactDocumentTitle>
    );
  }
}
