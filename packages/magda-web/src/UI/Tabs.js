import React, { Component } from 'react';
import { Link } from 'react-router';
import './Tabs.css';
class Tabs extends Component {
    constructor(props) {
      super(props);
    }

    render(){
      return (<ul className="tabs nav nav-tabs">
                {this.props.list.map(item=>
                <li role="presentation" 
                    key={item}>
                    <Link activeClassName="active"
                          to={`${this.props.baseUrl}/${item.toLowerCase()}`}>
                          {item}
                    </Link>
                </li>)}
              </ul>)
    }
}

Tabs.propTypes = {list: React.PropTypes.array,
                  baseUrl: React.PropTypes.string,
                };

export default Tabs;
