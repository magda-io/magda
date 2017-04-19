import React from 'react';
import logo from '../assets/logo.svg';
import ReactDocumentTitle from "react-document-title";
import {config} from '../config.js';
import { Link } from 'react-router';
import SearchBox from '../Search/SearchBox';
import MarkdownViewer from '../UI/MarkdownViewer';
import './AppContainer.css';

class AppContainer extends React.Component {  
  render() {
    const headerNavs = config.headerNavigation;
    const footerNavs = config.footerNavigation;
    return (
    
    <ReactDocumentTitle title={config.appName}>
        <div>
            <nav className='appContainer__nav'> 
              <div className="container">
                <div className="clearfix">
                    <div className="navbar-header">
                      <a className="navbar-brand" href="/"><img className='logo' alt='data.gov.au-alpha' src={logo}/></a>
                    </div>
                    <ul className="nav navbar-nav">
                      {headerNavs.map(nav=>
                        <li key={nav[1]}><Link to={`/${encodeURI(nav[1])}`}>{nav[0]}</Link></li>
                      )}
                    </ul>

                    <ul className="nav navbar-nav pull-right">
                      <li><Link to={`/sign-in`}>Sign in</Link></li>
                      <li><Link to={`/new-account`}>Create an account</Link></li>
                    </ul>
                </div>
                <div className="row">
                  <div className='col-sm-9'><SearchBox location={this.props.location}/> </div>
                  <div className='col-sm-3'><div className="appContainer__suggestion"> <MarkdownViewer markdown={config.suggestion}/></div></div>
                </div>
                </div>
                </nav>
                
                <div id="content" className="container" tabIndex="-1">{ this.props.children }</div>
                <footer className="container">
                  <ul className="nav row">
                  {
                    footerNavs.map(item=>
                      <li key={item.category} className="col-md-2 col-sm-4">{item.category}
                        <ul className="nav nav-pills nav-stacked">
                          {item.links.map(link=>
                          <li key={link[1]}><Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link></li>)
                          }
                        </ul>
                      </li>
                    )
                  }
                  </ul>
                </footer>
        </div>
      </ReactDocumentTitle>
    );
  }
}

export default AppContainer;




