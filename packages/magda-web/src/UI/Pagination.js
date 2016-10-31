import React, { Component } from 'react';
import './Pagination.css';
class Pagination extends Component {
    constructor(props) {
      super(props);

      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      console.log(i)
      this.props.goToPage(i)
    }
    render(){
      return <ul className='pagination'>
                <li><button className='pagination-item' onClick={this.onClick.bind(this, 0)}><i className="fa fa-angle-double-left" aria-hidden="true"></i></button></li>
                {
                  [...Array(this.props.maxIndex)].map((x,i)=>
                    <li key={i} className='pagination-item' onClick={this.onClick.bind(this, i)}>
                      <button className='pagination-item'>{i}</button>
                    </li>
                  )
                }
                <li><button className='pagination-item' onClick={this.onClick.bind(this, this.props.maxIndex-1)}><i className="fa fa-angle-double-right" aria-hidden="true"></i></button></li>
             </ul>
    }
}

Pagination.propTypes = {currentIndex: React.PropTypes.number, maxIndex: React.PropTypes.number, goToPage: React.PropTypes.func};
Pagination.defaultProps = { currentIndex: 0, maxIndex: 10};

export default Pagination;
