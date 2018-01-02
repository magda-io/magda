import React, { Component } from 'react';
import './Pagination.css';
import Button from 'muicss/lib/react/button';

class Pagination extends Component {
    constructor(props) {
      super(props);
      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      this.props.onPageChange(i);
    }

    render(){
      let currentPage = this.props.currentPage;
      return (
        <ul className='pagination__group mui-list--unstyled'>
          {this.props.currentPage !== 1 &&
            <li className='pagination__start pagination__item'>
              <Button  onClick={this.onClick.bind(this, 1)}>
                <i className='fa fa-angle-double-left' aria-hidden='true'></i>
                <span className='hidden-xs'>Start</span>
              </Button>
            </li>}
          {this.props.currentPage > 1 &&
            <li className='pagination__previous pagination__item'>
              <Button onClick={this.onClick.bind(this, currentPage - 1)}>
                <i className='fa fa-angle-left' aria-hidden='true'></i>
                Previous
              </Button>
              <div className='pagination__secondary-info hidden-xs'>
                Page {currentPage - 1} of {this.props.maxPage}
              </div>
            </li>}
          {this.props.currentPage < this.props.maxPage &&
            <li className='pagination__next pagination__item'>
              <Button  onClick={this.onClick.bind(this, currentPage + 1)}>
                Next
                <i className='fa fa-angle-right' aria-hidden='true'></i>
              </Button>
              <div className='pagination__secondary-info hidden-xs'>Page {currentPage} of {this.props.maxPage}</div>
          </li>}
        </ul>
      );
    }
}

export default Pagination;
