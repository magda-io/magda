import React, { Component } from 'react';
import { Link } from 'react-router';
import './Tabs.css';
class Tabs extends Component {
    render(){
      return (<div className="tabs">
            <ul className="nav nav-tabs container">
                  {this.props.list.map(item=>
                  <li role="presentation" 
                      key={item}>
                      <Link activeClassName="active"
                            to={`${this.props.baseUrl}/${item.toLowerCase()}`}>
                            {item}
                      </Link>
                  </li>)}
                </ul>
              </div>)
    }
}

Tabs.propTypes = {list: React.PropTypes.array,
                  baseUrl: React.PropTypes.string,
                };

export default Tabs;
