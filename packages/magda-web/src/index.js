import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search';
import SearchBody from './SearchBody';
import './index.css';
import { Router, Route, browserHistory, indexRoute } from 'react-router'

// http://baseurl.com/dataset?publisher=australianbroadcastingcorporation&q=tax


//<Route path="/magda-web/build/" component={Search}>

let baseurl = location.hostname === "localhost" ? '/' : '/magda-web/build/';

ReactDOM.render(
  <Router history={browserHistory}>
      <Route path={baseurl} component={Search}>
        <indexRoute component={Search}/>
        <Route path="/dataset" component={SearchBody}/>
      </Route>
    </Router>,
  document.getElementById('root')
);
