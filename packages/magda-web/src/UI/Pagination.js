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
      let data = [];
      if(this.props.maxPage <= MAXPAGINATION){
        data = [1, 2, 3, 4, 5];
      } else {
        let temp = [1, 2, 3, 4, 'truncate', this.props.maxPage];
        if(temp.indexOf(this.props.currentPage) > -1){
          data = temp;
        } else{
          data = [1, 2, 3, 'truncate', this.props.currentPage, 'truncate',this.props.maxPage]
        }
      }
      return <ul className='pagination'>
                <li><button className='btn pagination-item' onClick={this.onClick.bind(this, 1)}><i className="fa fa-angle-double-left" aria-hidden="true"></i></button></li>
                <li><button className='btn pagination-item' disabled={this.props.currentPage <= 1} onClick={this.onClick.bind(this, this.props.currentPage-1)}><i className="fa fa-angle-left" aria-hidden="true"></i></button></li>
                {
                  data.map((x, i)=>
                    <li key={i}>
                      {this.rendePagninationItem(x)}
                    </li>
                  )
                }
                <li><button className='btn pagination-item' disabled={this.props.currentPage >=this.props.maxPage} onClick={this.onClick.bind(this, this.props.currentPage+1)}><i className="fa fa-angle-right" aria-hidden="true"></i></button></li>
                <li><button className='btn pagination-item' onClick={this.onClick.bind(this, this.props.maxPage-1)}><i className="fa fa-angle-double-right" aria-hidden="true"></i></button></li>
             </ul>
    }
}

Pagination.propTypes = {currentPage: React.PropTypes.number, maxPage: React.PropTypes.number, goToPage: React.PropTypes.func};
Pagination.defaultProps = { currentPage: 1, maxPage: 10};

export default Pagination;
