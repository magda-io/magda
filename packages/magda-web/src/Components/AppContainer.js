import React from 'react';
import logo from '../assets/logo.svg';
import ReactDocumentTitle from "react-document-title";

class AppContainer extends React.Component {
  render() {
    return (
    <ReactDocumentTitle title="MAGDA">
        <div>
            <nav>
                <div className="container">
                    <div className="navbar-header">
                    <a className="navbar-brand" href=""><img className='logo' alt='data.gov.au-alpha' src={logo}/></a>
                    </div>
                </div>
                </nav>
                <div id="content" className="container" tabIndex="-1">{ this.props.children }</div>
        </div>
      </ReactDocumentTitle>
    );
  }
}

export default AppContainer;




