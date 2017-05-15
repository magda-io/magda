import React, { Component } from 'react';
import MarkdownViewer from '../UI/MarkdownViewer';
class OverviewBox extends Component {
    constructor(props){
        super(props);
        this.state = {
        isExpanded: false
        }
        this.toggleExpand = this.toggleExpand.bind(this);
    }

  toggleExpand(){
    this.setState({
      isExpanded: !this.state.isExpanded
    })
  }
    render(){
      return <div className="white-box overview-box">
                {this.props.content && <MarkdownViewer markdown={this.props.content} stripped={!this.state.isExpanded}/>}
                <button onClick={this.toggleExpand} className="overview-toggle btn btn-reset"><i className={`fa fa-chevron-${this.state.isExpanded ? "up" : "down"}`} aria-hidden="true"></i></button>
            </div>
    }
}

OverviewBox.propTypes = {
  content: React.PropTypes.string
}

export default OverviewBox;
