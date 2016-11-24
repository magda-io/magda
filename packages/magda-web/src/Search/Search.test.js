import React from 'react';
import ReactDOM from 'react-dom';
import Search from './Search';
import defined from '../helpers/defined';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<Search />, div);
});
