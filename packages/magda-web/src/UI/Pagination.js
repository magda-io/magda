import React, { Component } from 'react';
import './Pagination.css';

class Pagination extends Component {
    constructor(props) {
      super(props);

      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      this.props.goToPage(i);
    }

    render(){
      let currentPage = this.props.currentPage;
      return (
        <ul className='pagination-group list-unstyled'>
          {this.props.currentPage !== 1 &&
            <li className='pagination-start pagination-item'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, 1)}>
                <i className="fa fa-angle-double-left" aria-hidden="true"></i>
                <span className='hidden-xs'>Start</span>
              </button>
            </li>}
          {this.props.currentPage > 1 &&
            <li className='pagination-previous pagination-item'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage - 1)}>
                <i className="fa fa-angle-left" aria-hidden="true"></i>
                Previous
              </button>
              <div className='pagination-secondary-info hidden-xs'>
                Page {currentPage - 1} of {this.props.maxPage}
              </div>
            </li>}
          {this.props.currentPage < this.props.maxPage &&
            <li className='pagination-next pagination-item'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage + 1)}>
                Next
                <i className="fa fa-angle-right" aria-hidden="true"></i>
              </button>
              <div className='pagination-secondary-info hidden-xs'>Page {currentPage + 1} of {this.props.maxPage}</div>
          </li>}
        </ul>
      );
    }
}

Pagination.propTypes = {currentPage: React.PropTypes.number, maxPage: React.PropTypes.number, goToPage: React.PropTypes.func};
Pagination.defaultProps = { currentPage: 1, maxPage: 10};

export default Pagination;
