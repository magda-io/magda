import './index.css';
import { Router, Route, browserHistory, indexRoute } from 'react-router'
import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search/Search';

//<Route path="/magda-web/build/" component={Search}>

let baseurl = location.hostname === "localhost" ? '/' : '/magda-web/build/';

ReactDOM.render(
  <Router history={browserHistory}>
      <Route path={baseurl} component={Search}>
        <indexRoute component={Search}/>
      </Route>
    </Router>,
  document.getElementById('root')
);
