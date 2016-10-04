import './SearchTabs.css';
import React, { Component } from 'react';
import { Link } from 'react-router'

class SearchTabs extends Component {
  render(){
    return (<ul className='search-tabs nav col-sm-8 col-sm-offset-4'>
      <li role='presentation' className='active'><a href='#'>All</a></li>
      <li role='presentation'><a href='#'>Data</a></li>
      <li role='presentation'><a href='#'>Organisations</a></li>
    </ul>);
  }
}

export default SearchTabs;
