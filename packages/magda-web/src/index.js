// @flow
// eslint-disable-next-line
import createLogger from 'redux-logger'
import './index.css';
import { Router, Route, browserHistory, IndexRoute } from 'react-router'
import {fetchSearchResultsIfNeeded} from './actions/results';
import thunkMiddleware from 'redux-thunk'
import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search/Search';
import { Provider } from 'react-redux';
import search from './reducers/index';
import { createStore, applyMiddleware} from 'redux';

let baseurl = location.pathname;
// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store = createStore(
   search,
   applyMiddleware(
     thunkMiddleware, // lets us dispatch() functions
     // loggerMiddleware // neat middleware that logs actions
   )
)

browserHistory.listen (location=>{
  window.ga('set', 'location', document.location);
  window.ga('send', 'pageview');
  store.dispatch(fetchSearchResultsIfNeeded(location.query));
})

ReactDOM.render(
  <Provider store={store}>
    <Router history={browserHistory}>
      <Route path={baseurl} ignoreScrollBehavior>
        <IndexRoute component={Search}/>
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
);
