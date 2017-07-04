//@flow
import React from 'react';
import logo from '../assets/logo.svg';
import ReactDocumentTitle from 'react-document-title';
import { config } from '../config.js';
import { Link } from 'react-router';
import SearchBox from '../Search/SearchBox';
import AccountNavbar from './Account/AccountNavbar';
import d61logo from './data61-logo.png';

import { ExtraSmall, Small } from '../UI/Responsive';
import './AppContainer.css';

export default class AppContainer extends React.Component {
  constructor(props) {
    super(props);
    this.state = { isOpen: false, showPrototypeWarning: true };
  }
  renderLink(link: string) {
    const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
    if (!regex.test(link[1])) {
      return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
    }
    return <a target='_blank' href={link[1]}>{link[0]}</a>;
  }

  toggleMenu() {
    this.setState({
      isOpen: !this.state.isOpen
    });
  }

  dismissPrototypeWarning(){
    this.setState({
      showPrototypeWarning: false
    })
  }
  render() {
    const headerNavs: Array<string> = config.headerNavigation;
    const footerNavs: Array<string> = config.footerNavigation;
    return (
      <ReactDocumentTitle title={config.appName}>
        <div>
        {this.state.showPrototypeWarning && <div className='prototype-warning'>
          <div className='prototype-warning-text'>This is a working alpha and has limited functionality, please let us know <a href='http://preview.data.gov.au/feedback.html' target='_blank'>your feedback</a>.</div>
          <button className='prototype-warning-dismiss btn' onClick={()=>this.dismissPrototypeWarning()}><i className="fa fa-times" aria-hidden="true"></i></button>
        </div>}
          <nav className='appContainer__nav'>
            <div className='container'>
              <div className='row'>
                <Small>
                  <div className='col-sm-2'>
                    <div className='navbar-header'>
                      <a className='navbar-brand' href='/'>
                        <img
                          className='logo'
                          alt='data.gov.au-alpha'
                          src={logo}
                        />
                      </a>
                    </div>
                  </div>
                  <div className='col-sm-10 nav-links'>
                    {config.disableAuthenticationFeatures || <AccountNavbar />}

                    <ul className='nav navbar-nav'>
                      {headerNavs.map(nav =>
                        <li key={nav[1]}>
                          <Link to={`/${encodeURI(nav[1])}`}>{nav[0]}</Link>
                        </li>
                      )}
                    </ul>
                  </div>
                </Small>
                <ExtraSmall>
                  <div className='mobile-nav'>
                    <button
                      className='btn navbar-toggle'
                      onClick={() => this.toggleMenu()}
                    >
                      {' '}<span className='sr-only'>Toggle navigation</span>
                      {' '}MENU
                      {' '}
                    </button>
                    <a className='navbar-brand' href='/'>
                      <img
                        className='logo'
                        alt='data.gov.au-alpha'
                        src={logo}
                      />
                    </a>
                    <div
                      className={`navbar-collapse collapse ${this.state.isOpen
                        ? 'in'
                        : ''}`}
                      aria-expanded={`${this.state.isOpen ? 'true' : 'false'}`}
                    >
                      <ul className='nav nav-pills nav-stacked'>
                        {headerNavs.map(nav =>
                          <li key={nav[1]}>
                            <Link to={`/${encodeURI(nav[1])}`}>{nav[0]}</Link>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </ExtraSmall>

              </div>
              <div className='row nav_second'>
                <div className='col-sm-8'>
                  <h1 className='search-heading'> Australia open data search</h1>
                  <SearchBox location={this.props.location} />
                  {' '}
                </div>
                <Small>
                  <div className='col-sm-4'>
                    <div className='appContainer__suggestion'>
                      Try Search for
                      <ul className='list-unstyled'>
                      {config.suggestion.map(s=>
                        <li key={s}><Link to={'/search?q=' + encodeURI(s)}>
                        {s}
                        </Link></li>)}
                    </ul>

                      <Link to={'page/search-syntax'}> Learn about the new search</Link>
                    </div>
                  </div>
                </Small>
              </div>
            </div>
          </nav>

          <div id='content' className='clearfix'>{this.props.children}</div>
          <footer className='footer clearfix'>
            <div className='container'>
              <ul className='nav row'>
                {footerNavs.map(item =>
                  <li key={item.category} className='col-md-2 col-sm-4'>
                    <span className='nav-title'>{item.category}</span>
                    <ul className='nav nav-pills nav-stacked'>
                      {item.links.map(link =>
                        <li key={link[1]}>{this.renderLink(link)}</li>
                      )}
                    </ul>
                  </li>
                )}
              </ul>
              <div className='copyright'> Developed by <img src={d61logo} alt='data61-logo'/></div>
            </div>

          </footer>
        </div>
      </ReactDocumentTitle>
    );
  }
}
