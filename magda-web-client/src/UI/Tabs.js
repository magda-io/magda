import React from 'react';
import { NavLink } from 'react-router-dom';
import './Tabs.css';

function Tabs(props) {
  return (
      <div className='tabs'>
            <ul className='nav nav-tabs container'>
                  {props.list.filter(i=>i.isActive).map(item=>
                  <li role='presentation'
                      key={item.id}>
                      <NavLink activeClassName='active'
                            to={`${props.baseUrl}/${item.id}`}>
                            {item.name}
                      </NavLink>
                  </li>)}
                </ul>
              </div>
  );
}


export default Tabs;
