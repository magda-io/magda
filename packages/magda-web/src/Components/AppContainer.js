import React from 'react';
import logo from '../assets/logo.svg';
import ReactDocumentTitle from "react-document-title";
import {config} from '../config.js';
import { Link } from 'react-router';

class AppContainer extends React.Component {  
  render() {
    const headerNavs = config.headerNavigation;
    const footerNavs = config.footerNavigation;
    return (
    <ReactDocumentTitle title="MAGDA">
        <div>
            <nav>
                <div className="container">
                    <div className="navbar-header">
                      <a className="navbar-brand" href=""><img className='logo' alt='data.gov.au-alpha' src={logo}/></a>
                    </div>
                    <ul className="nav navbar-nav">
                      {headerNavs.map(nav=>
                        <li key={nav}><Link to={`/${nav.toLowerCase()}`}>{nav}</Link></li>
                      )}
                    </ul>

                    <ul className="nav navbar-nav pull-right">
                      <li><Link to={`/sign-in`}>Sign in</Link></li>
                      <li><Link to={`/new-account`}>Create an account</Link></li>
                    </ul>

                </div>
                </nav>
                <div id="content" className="container" tabIndex="-1">{ this.props.children }</div>
                <footer className="container">
                  <ul className="nav row">
                  {
                    footerNavs.map(item=>
                      <li className="col-md-2 col-sm-4">{item.category}
                        <ul className="nav nav-pills nav-stacked">
                          {item.links.map(link=>
                          <li key={link}><Link to={`/${link}`}>{link}</Link></li>)
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




