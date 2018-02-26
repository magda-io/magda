import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MarkdownViewer from '../UI/MarkdownViewer';
import './DescriptionBox.css';
import Button from 'muicss/lib/react/button';

class DescriptionBox extends Component {
    constructor(props){
        super(props);
        this.state = {
            isExpanded: false,
            showToggle: false
        }
        this.toggleExpand = this.toggleExpand.bind(this);
    }

    onToggleButtonClick(){
      this.setState({
        isExpanded: !this.state.isExpanded
      })
    }


    renderToggle(isExpanded){
      return <Button onClick={this.toggleExpand}><span className='sr-only'>{isExpanded ? 'show less' : 'show more'}</span><i className={`fa fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden='true'></i></Button>;
    }

    render(){
      return <div className={`white-box overview-box ${this.state.isExpanded ? 'is-expanded': ''}`}>
                <MarkdownViewer markdown={content} truncate={!this.state.isExpanded && this.props.isAutoTruncate} truncateLength={this.props.truncateLength} />
                {this.props.content && this.renderContent(this.props.content)}
                {this.state.showToggle && this.renderToggle(this.state.isExpanded)}
                {this.state.showToggle ? (
                    <Button onClick={()=>this.onToggleButtonClick()}>
                        <span className='sr-only'>{isExpanded ? 'show less' : 'show more'}</span>
                        <i className={`fa fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden='true'></i>
                    </Button>
                ) : null }
            </div>
    }
}

DescriptionBox.PropTypes = {
    isAutoTruncate : PropTypes.bool,
    truncateLength : PropTypes.number
};

DescriptionBox.defaultProps = {
    isAutoTruncate : true,
    truncateLength : 550
};

export default DescriptionBox;
