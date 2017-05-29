import React, { Component } from 'react';
import { Link } from 'react-router';
import './Tabs.css';
class Tabs extends Component {
    render(){
      return (<div className="tabs">
            <ul className="nav nav-tabs container">
                  {this.props.list.filter(i=>i.isActive).map(item=>
                  <li role="presentation"
                      key={item.id}>
                      <Link activeClassName="active"
                            to={`${this.props.baseUrl}/${item.id}`}>
                            {item.name}
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
