import React from 'react';
import logo from '../assets/logo.svg';

class Home extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <div>
          <nav>
            <div className="container">
                <div className="navbar-header">
                <a className="navbar-brand" href="%PUBLIC_URL%"><img className='logo' alt='data.gov.au-alpha' src={logo}/></a>
                </div>
            </div>
            </nav>
      </div>
    );
  }
}

export default Home;




