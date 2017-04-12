// @flow
// eslint-disable-next-line
import createLogger from 'redux-logger'
import './index.css';
import { Router, Route, browserHistory, IndexRoute } from 'react-router'
import {fetchSearchResultsIfNeeded} from './actions/results';
import thunkMiddleware from 'redux-thunk'
import React from 'react';
import ReactDOM from 'react-dom';
import Home from './Components/Home';
import Search from './Components/Search';
import DatasetDetails from './Components/DatasetDetails';
import { Provider } from 'react-redux';
import reducer from './reducers/index';
import { createStore, applyMiddleware} from 'redux';

let baseurl = location.pathname;
// eslint-disable-next-line
const loggerMiddleware = createLogger();

const store = createStore(
   reducer,
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
        <IndexRoute component={Home}/>
        <Route path="dataset/:dataset/" component={DatasetDetails} />
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
);
