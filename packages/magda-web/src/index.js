import './index.css';
import { Router, Route, browserHistory, indexRoute } from 'react-router'
import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search/Search';
import { Provider } from 'react-redux';
import search from './reducers/index';
import { createStore } from 'redux';

let baseurl = location.hostname === "localhost" ? '/' : '/magda-web/build/';
//<Route path="/magda-web/build/" component={Search}>

const store = createStore(search);

console.log(store);

ReactDOM.render(
  <Provider store={store}>
    <Router history={browserHistory}>
      <Route path={baseurl} component={Search}>
        <indexRoute component={Search}/>
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
);
