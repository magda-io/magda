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
            <li className='pagination-start'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, 1)}> Start</button>
            </li>}
          {this.props.currentPage > 1 &&
            <li className='pagination-previous'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage - 1)}> Previous</button>
              <div className='pagination-secondary-info'>Page {currentPage - 1} of {this.props.maxPage}</div>
            </li>}
          {this.props.currentPage < this.props.maxPage &&
            <li className='pagination-next'>
              <button className='pagination-btn btn' onClick={this.onClick.bind(this, currentPage + 1)}> Next</button>
              <div className='pagination-secondary-info'>Page {currentPage + 1} of {this.props.maxPage}</div>
          </li>}
        </ul>
      );
    }
}

Pagination.propTypes = {currentPage: React.PropTypes.number, maxPage: React.PropTypes.number, goToPage: React.PropTypes.func};
Pagination.defaultProps = { currentPage: 1, maxPage: 10};

export default Pagination;
