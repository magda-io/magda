import base from './RealtimeData/Base';
import firebase from 'firebase';

class UserManagement {
    currentUser() {
        return base.auth().currentUser;
    }

    onAuthStateChanged(...args) {
        base.auth().onAuthStateChanged(...args);
    }
}

export default new UserManagement();