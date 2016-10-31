import React, { Component } from 'react';
import './Pagination.css';
class Pagination extends Component {
    constructor(props) {
      super(props);

      this.onClick = this.onClick.bind(this);
    }

    onClick(i){
      this.props.goToPage(i)
    }
    render(){
      return <ul className='pagination'>
                {
                  this.props.maxIndex.map(i=>
                    <li className='pagination-item' onClick={this.onClick.bind(this, i)}></li>
                  )
                }
             </ul>
    }
}

Pagination.propTypes = {currentIndex: React.PropTypes.number, maxIndex: React.PropTypes.number};
Pagination.defaultProps = { currentIndex: 0, maxIndex: 10};

export default Pagination;
