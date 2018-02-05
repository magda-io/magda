import React, { Component } from 'react';
import {config} from '../config';

import Button from 'muicss/lib/react/button';
import './Pagination.css';

class Pagination extends Component {
    constructor(props) {
      super(props);
      this.onClick = this.onClick.bind(this);
    }

    onClick(page){
      this.props.onPageChange(page);
    }

    renderPageList(max, current){
      const pages = [...Array(max).keys()].map(x => ++x);
      const margins = [...Array(3).keys()].map(x => ++x);
      if(max > 5){
        if(current <= 3 || current === max){
          return (<ul className= 'pagination-list'>
                    {current > 1 && <Button onClick={this.onClick.bind(this, current - 1)}> prev </Button>}
                    {margins.map(i => <li key={i}><Button onClick={this.onClick.bind(this, i)} className={`${ i === current ? 'current' : ''}`}>{i}</Button></li>)}
                    <li><Button disabled={true}>...</Button></li>
                    <li><Button onClick={this.onClick.bind(this, max)}>{max}</Button></li>
                    {current < this.props.maxPage && <Button onClick={this.onClick.bind(this, current + 1)}> next </Button>}
                  </ul>)
      }
      return (<ul className= 'pagination-list'>
                {current > 1 && <Button onClick={this.onClick.bind(this, current - 1)}> prev </Button>}
                {margins.map(i => <li key={i}><Button onClick={this.onClick.bind(this, i)}>{i}</Button></li>)}
                <li><Button disabled={true}>...</Button></li>
                <li><Button onClick={this.onClick.bind(this, current)} className='current'>{current}</Button></li>
                <li><Button disabled={true}>...</Button></li>
                <li><Button onClick={this.onClick.bind(max)}>{max}</Button></li>
                {current < max && <Button onClick={this.onClick.bind(this, current + 1)}> next </Button>}
              </ul>)
      } else {
        return (<ul className= 'pagination-list'>
                {current > 1 && <Button onClick={this.onClick.bind(this, current - 1)}> prev </Button>}
                {pages.map(i => <li key={i}><Button onClick={this.onClick.bind(this, i)} className={`${ i === current ? 'current' : ''}`}>{i}</Button></li>)}
                {current < max && <Button onClick={this.onClick.bind(this, current + 1)}> next </Button>}
               </ul>)
      }
  }


    render(){
      let currentPage  = this.props.currentPage;
      let startIndex = currentPage ===  1 ? 1 : currentPage * config.resultsPerPage + 1;

      return (
        <div className='pagination'>
            {this.renderPageList(this.props.maxPage, currentPage)}
            <div className='pagination-summray'> {startIndex} - {startIndex + config.resultsPerPage} of {this.props.maxPage} results</div>
        </div>
      );
    }
}

export default Pagination;
