import React, { Component } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import './Pagination.css';

class Pagination extends Component {
    constructor(props) {
      super(props);

      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      let {router} = this.context;
      router.push({
        pathname: this.props.location.pathname,
        query: Object.assign(queryString.parse(this.props.location.search), {page: i})
      });
    }


    render(){
      let currentPage = this.props.currentPage;
      return (
        <ul className='pagination__group list-unstyled'>
          {this.props.currentPage !== 1 &&
            <li className='pagination__start pagination__item'>
              <button className='pagination__btn btn' onClick={this.onClick.bind(this, 1)}>
                <i className='fa fa-angle-double-left' aria-hidden='true'></i>
                <span className='hidden-xs'>Start</span>
              </button>
            </li>}
          {this.props.currentPage > 1 &&
            <li className='pagination__previous pagination__item'>
              <button className='pagination__btn btn' onClick={this.onClick.bind(this, currentPage - 1)}>
                <i className='fa fa-angle-left' aria-hidden='true'></i>
                Previous
              </button>
              <div className='pagination__secondary-info hidden-xs'>
                Page {currentPage - 1} of {this.props.maxPage}
              </div>
            </li>}
          {this.props.currentPage < this.props.maxPage &&
            <li className='pagination__next pagination__item'>
              <button className='pagination__btn btn' onClick={this.onClick.bind(this, currentPage + 1)}>
                Next
                <i className='fa fa-angle-right' aria-hidden='true'></i>
              </button>
              <div className='pagination__secondary-info hidden-xs'>Page {currentPage} of {this.props.maxPage}</div>
          </li>}
        </ul>
      );
    }
}

Pagination.contextTypes ={
  router: PropTypes.object.isRequired,
}

export default Pagination;
