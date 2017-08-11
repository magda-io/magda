import React, { Component } from 'react';
import { Link } from 'react-router';
import './Tabs.css';

function Tabs(props) {
  return (
      <div className='tabs'>
            <ul className='nav nav-tabs container'>
                  {props.list.filter(i=>i.isActive).map(item=>
                  <li role='presentation'
                      key={item.id}>
                      <Link activeClassName='active'
                            to={`${props.baseUrl}/${item.id}`}>
                            {item.name}
                      </Link>
                  </li>)}
                </ul>
              </div>
  );
}


export default Tabs;
