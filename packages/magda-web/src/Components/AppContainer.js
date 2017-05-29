import React from "react";
import logo from "../assets/logo.svg";
import ReactDocumentTitle from "react-document-title";
import MediaQuery from "react-responsive";
import { config } from "../config.js";
import { Link } from "react-router";
import SearchBox from "../Search/SearchBox";
import ProgressBar from "../UI/ProgressBar";
import { Small, Medium, Large } from "../UI/Responsive";
import { connect } from "react-redux";
import "./AppContainer.css";

class AppContainer extends React.Component {
  renderLink(link) {
    const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
    if (!regex.test(link[1])) {
      return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
    }
    return <a target="_blank" href={link[1]}>{link[0]}</a>;
  }
  render() {
    const headerNavs = config.headerNavigation;
    const footerNavs = config.footerNavigation;
    return (
      <ReactDocumentTitle title={config.appName}>
        <div>
          {this.props.isFetching && <ProgressBar />}
          <nav className="appContainer__nav">
            <div className="container">
              <div className="row">
                <div className="col-sm-2">
                  <div className="navbar-header">
                    <a className="navbar-brand" href="/">
                      <img
                        className="logo"
                        alt="data.gov.au-alpha"
                        src={logo}
                      />
                    </a>
                  </div>
                </div>

                <Medium>
                  <div className="col-sm-10 nav-links">
                    {this.props.user && this.props.user.user
                      ? <li>You are {this.props.user.user.displayName}</li>
                      : <ul className="nav navbar-nav navbar-account">
                          <li>
                            <Link to={`/new-account`}>Create an account</Link>
                          </li>
                          <li><Link to={`/sign-in`}>Sign in</Link></li>
                        </ul>}

                    <ul className="nav navbar-nav">
                      {headerNavs.map(nav => (
                        <li key={nav[1]}>
                          <Link to={`/${encodeURI(nav[1])}`}>{nav[0]}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Medium>
              </div>
              <div className="row nav_second">
                <div className="col-sm-8">
                  <SearchBox location={this.props.location} />{" "}
                </div>
                <Small>
                  <div className="col-sm-4">
                    <div className="appContainer__suggestion">
                      {" "}
                      Try Search for
                      {" "}
                      <Link to={"/search?q=" + encodeURI(config.suggestion)}>
                        {config.suggestion}
                      </Link>
                    </div>
                  </div>
                </Small>
              </div>
            </div>
          </nav>

          <div id="content" className="clearfix">{this.props.children}</div>
          <footer className="footer clearfix">
            <div className="container">
              <ul className="nav row">
                {footerNavs.map(item => (
                  <li key={item.category} className="col-md-2 col-sm-4">
                    <span className="nav-title">{item.category}</span>
                    <ul className="nav nav-pills nav-stacked">
                      {item.links.map(link => (
                        <li key={link[1]}>{this.renderLink(link)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </footer>
        </div>
      </ReactDocumentTitle>
    );
  }
}

function mapStateToProps(state) {
  let { datasetSearch, record, publisher, project, user } = state;

  console.log(user);

  return {
    isFetching: datasetSearch.isFetching ||
      record.isFetching ||
      publisher.isFetchingPublishers ||
      publisher.isFetchingPublisher ||
      project.isFetching,
    user
  };
}

export default connect(mapStateToProps)(AppContainer);
