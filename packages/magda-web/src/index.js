// @flow
// eslint-disable-next-line
import createLogger from 'redux-logger'
import './index.css';
import { Router, Route, browserHistory, IndexRoute, IndexRedirect } from 'react-router'
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
import DatasetDetails from './Dataset/DatasetDetails';
import DatasetDiscussion from './Dataset/DatasetDiscussion';
import DatasetPublisher from './Dataset/DatasetPublisher';

import ResourceDetails from './Dataset/ResourceDetails';
import ResourceMap from './Dataset/ResourceMap';
import ResourceChart from './Dataset/ResourceChart';

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
        <Route path="dataset/:datasetId" component={DatasetHandler}>
          <IndexRedirect to="details"/>
          <Route path="details" component={DatasetDetails}/>
          <Route path="discussion" component={DatasetDiscussion}/>
          <Route path="publisher" component={DatasetPublisher}/>
        </Route>
        <Route path="dataset/:datasetId/resource/:resourceId" component={DatasetHandler}>
            <IndexRedirect to="details"/>
            <Route path="details" component={ResourceDetails}/>
            <Route path="map" component={ResourceMap}/>
            <Route path="chart" component={ResourceChart}/>
        </Route>
        {staticPageRegister.map( item => 
        <Route path={item.path} key={item.path} component={item.component}/>)}
      </Route>
    </Router>
  </Provider>,
  document.getElementById('root')
);
