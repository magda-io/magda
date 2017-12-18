//@flow
import ReactDocumentTitle from 'react-document-title';
import React from 'react';
import logo from './assets/logo.svg';
import { config } from './config.js';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';


import SearchBox from './Components/Search/SearchBox';
import AccountNavbar from './Components/Account/AccountNavbar';
import d61logo from './data61-logo.png';


import ProjectsViewer from './Components/Project/ProjectsViewer';
import ProjectDetails from './Components/Project/ProjectDetails';
import CreateProject from './Components/Project/CreateProject';

import PublishersViewer from './Components/Publisher/PublishersViewer';
import PublisherDetails from './Components/Publisher/PublisherDetails';



import Home from './Components/Home';
import RouteNotFound from './Components/RouteNotFound';
import Search from './Components/Search/Search';
import RecordHandler from './Components/RecordHandler';
import { staticPageRegister } from './content/register';

import Feedback from './Components/Feedback';
import Contact from './Components/Contact';
import Account from './Components/Account/Account';
import Login from './Components/Account/Login';
import SignInRedirect from './Components/Account/SignInRedirect';
import { requestWhoAmI } from './actions/userManagementActions';
import Container from 'muicss/lib/react/container';
import Appbar from 'muicss/lib/react/appbar';

import {
  Route,
  Link,
  Switch
} from 'react-router-dom';

import { ExtraSmall, Small } from './UI/Responsive';
import './AppContainer.css';

class AppContainer extends React.Component {
  state :{
    isOpen: boolean,
  }
  constructor(props: {
    location: Location,
    children: React$Element<any>
  }) {
    super(props);
    this.state = { isOpen: false};
  }

  componentWillMount(){
    this.props.requestWhoAmI()
  }
  renderLink(link: string) {
    const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-/]))?/;
    if (!regex.test(link[1])) {
      return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
    }
    return <a target='_blank' rel='noopener noreferrer' href={link[1]}>{link[0]}</a>;
  }

  toggleMenu() {
    this.setState({
      isOpen: !this.state.isOpen
    });
  }

  renderBody(){
    return (<Switch>
      <Route exact path='/' component={Home} />
      <Route exact path='/search' component={Search} />
      <Route exact path='/feedback' component={Feedback} />
      <Route exact path='/contact' component={Contact} />
      <Route exact path='/account' component={Account} />
      <Route exact path='/login' component={Login} />
      <Route exact path='/sign-in-redirect' component={SignInRedirect} />
      <Route path='/dataset/:datasetId/distribution/:distributionId' component={RecordHandler}/>
      <Route path='/dataset/:datasetId' component={RecordHandler}/>
      <Route exact path='/projects' component={ProjectsViewer} />
      <Route exact path='/projects/new' component={CreateProject} />
      <Route path='/projects/:projectId' component={ProjectDetails} />
      <Route exact path='/publishers' component={PublishersViewer} />
      <Route path='/publishers/:publisherId' component={PublisherDetails} />
      {staticPageRegister.map(item => <Route path={`/page/:id`} key={item.path} component={item.component} />)}
      <Route exact path='/404' component={RouteNotFound} />
      <Route path='/*' component={RouteNotFound} />
    </Switch>);
  }


  render() {
    const headerNavs: Array<Array<string>> = config.headerNavigation;
    const footerNavs: Array<Object> = config.footerNavigation;
    return (
      <ReactDocumentTitle title={config.appName}>
        <div>
          <nav className='appContainer__nav'>
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
                      aria-expanded={this.state.isOpen ? true : false}
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

              <Container>
                <div className='col-sm-8'>
                  <h1 className='search-heading'> {config.appTitle}</h1>
                  <SearchBox location={this.props.location} />
                </div>
              </Container>
          </nav>
          <Container>
            {this.renderBody()}
          </Container>
          <footer className='footer clearfix'>
            <Container>
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
              </Container>
          </footer>
        </div>
      </ReactDocumentTitle>
    );
  }
}


const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    requestWhoAmI: requestWhoAmI,
  }, dispatch);
}

export default connect(null, mapDispatchToProps)(AppContainer);
