import React, { Component } from 'react';
import './Star.css';
class Star extends Component {
    constructor(props){
      super(props);
      this.onClick = this.onClick.bind(this);
      this.hideInfo = this.hideInfo.bind(this);
      this.state = {
        showInfo: false
      };
    }

    componentDidMount(){
      window.addEventListener('click', this.hideInfo);
    }

    onClick(event){
      event.stopPropagation();
      this.props.onClick();
      this.setState({
        showInfo: !this.props.isOn
      })
    }

    hideInfo(){
      this.setState({
        showInfo: false
      })
    }

    componentWillUnmount(){
      window.removeEventListener('click', this.hideInfo);
    }

    render(){
      return <div className='star'>
                <button onClick={this.onClick} className={`btn star-btn ${this.props.isOn ? 'is-active' : ''}`}>
                  <i className="fa fa-star" aria-hidden="true"/>
                </button>
                {this.state.showInfo && <div className='star-info'>
                                            <div className='star-info-text'>
                                              Saved to starred items
                                            </div>
                                          </div>}
             </div>
    }
}
export default Star;
