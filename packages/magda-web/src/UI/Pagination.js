import React, { Component } from 'react';
import './Pagination.css';

const MAXPAGINATION = 5;

class Pagination extends Component {
    constructor(props) {
      super(props);

      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      this.props.goToPage(i);
    }

    rendePagninationItem(x){
      if(x === 'truncate'){
        return <span className='pagination-truncate'>...</span>
      }
      return <button onClick={this.onClick.bind(this, x)} className={`btn pagination-item ${x === this.props.currentPage ? 'is-active' : ''}`}>{x}</button>
    }


    render(){
      let currentPage = this.props.currentPage;
      let prevPage;
      let nextPage;

      if(currentPage > 1){
        prevPage = currentPage - 1;
      } else if(currentPage < this.props.maxPage){
        nextPage = currentPage + 1;
      }

      return (
        <ul className='pagination list-unstyled'>
          {this.props.currentPage !== 1 && <li className='pagination-start'><button className='pagination-btn btn' onClick={this.onClick.bind(this, 1)}> Start</button></li>}
          {this.props.currentPage > 1 && <li className='pagination-previous'><button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage - 1)}> Previous</button></li>}
          {this.props.currentPage < this.props.maxPage && <li className='pagination-next'><button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage + 1)}> Next</button></li>}
        </ul>
      );
    }
}

Pagination.propTypes = {currentPage: React.PropTypes.number, maxPage: React.PropTypes.number, goToPage: React.PropTypes.func};
Pagination.defaultProps = { currentPage: 1, maxPage: 10};

export default Pagination;
