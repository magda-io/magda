import React from 'react';
import { NavLink } from 'react-router-dom';
import './Tabs.css';

function Tabs(props) {
  return (
      <div className='mui-tabs__bar'>
            <ul className='mui-tabs__bar'>
                  {props.list.filter(i=>i.isActive).map(item=>
                  <li role='presentation'
                      key={item.id}>
                      <NavLink activeClassName='mui--is-active'
                            to={`${props.baseUrl}/${item.id}`}
                            onClick={()=>{props.onTabChange(item.id)}}>
                            {item.name}
                      </NavLink>
                  </li>)}
                </ul>
              </div>
  );
}


export default Tabs;
