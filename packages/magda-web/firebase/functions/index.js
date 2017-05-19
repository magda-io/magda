const functions = require("firebase-functions");
const firebase = require("firebase");

firebase.initializeApp(functions.config().firebase);

exports.addUserToDatabase = functions.auth.user().onCreate(event => {
  const user = event.data;

  const userData = firebase.database().ref(`/users/${user.uid}`);

  console.log(user);

  return userData
    .set(user)
    .catch(e => {
      console.error(e);
      throw e;
    });
});

exports.deleteUserFromDatabase = functions.auth.user().onDelete(event => {
  const user = event.data;

  return firebase.database().ref(`/users/${user.uid}`).remove().catch(e => {
    console.error(e);
    throw e;
  });
});
