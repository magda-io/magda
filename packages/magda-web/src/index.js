import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search';
import SearchBody from './SearchBody';
import './index.css';
import { Router, Route, hashHistory, browserHistory, indexRoute } from 'react-router'

// http://baseurl.com/dataset?publisher=australianbroadcastingcorporation&q=tax


//<Route path="/magda-web/build/" component={Search}>

let baseurl = location.hostname === "localhost" ? '/' : '/magda-web/build/';
let history = location.hostname === "localhost" ? browserHistory : hashHistory;

ReactDOM.render(
  <Router history={history}>
      <Route path={baseurl} component={Search}>
        <indexRoute component={Search}/>
      </Route>
    </Router>,
  document.getElementById('root')
);
