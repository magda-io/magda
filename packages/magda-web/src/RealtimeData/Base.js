import Rebase from "re-base";

const devConfig = {
  apiKey: "AIzaSyAW8ZGAcE897Eet5JoauB2GVQlKakTzGLo",
  authDomain: "terriajs-dev.firebaseapp.com",
  databaseURL: "https://terriajs-dev.firebaseio.com",
  projectId: "terriajs-dev",
  storageBucket: "terriajs-dev.appspot.com",
  messagingSenderId: "537129558883"
};

const prodConfig = {
  apiKey: "AIzaSyD0Go1ZqtfqZj6Tmp7qMgAx4muL73DEg10",
  authDomain: "terriajs.firebaseapp.com",
  databaseURL: "https://terriajs.firebaseio.com",
  projectId: "terriajs",
  storageBucket: "terriajs.appspot.com",
  messagingSenderId: "275237095477"
};
const config = devConfig;
const base = Rebase.createClass(config);

export default base;
