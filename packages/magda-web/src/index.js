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
import Search from './Search/Search';
import DatasetHandler from './Components/DatasetHandler';
import AppContainer from './Components/AppContainer';
import { Provider } from 'react-redux';
import reducer from './reducers/index';
import { createStore, applyMiddleware} from 'redux';
import { staticPageRegister } from './content/register';

let baseurl = "/";
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
})

ReactDOM.render(
  <Provider store={store}>
    <Router history={browserHistory}>
      <Route path={baseurl} component={AppContainer}>
        <IndexRoute component={Home}/>
        <Route path="search" component={Search} />
        <Route path="dataset/:datasetId" component={DatasetHandler} />
        {staticPageRegister.map( item => 
        <Route path={item.path} key={item.path} component={item.component}/>)}
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
);
