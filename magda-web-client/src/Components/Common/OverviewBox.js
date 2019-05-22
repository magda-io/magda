import React, { Component } from "react";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import "./OverviewBox.scss";

class OverviewBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isExpanded: false,
            showToggle: false
        };
        this.toggleExpand = this.toggleExpand.bind(this);
    }

    toggleExpand() {
        this.setState({
            isExpanded: !this.state.isExpanded
        });
    }

    renderToggle(isExpanded) {
        return (
            <button className="au-btn" onClick={this.toggleExpand}>
                <span className="sr-only">
                    {isExpanded ? "show less" : "show more"}
                </span>
                <i
                    className={`fa fa-chevron-${isExpanded ? "up" : "down"}`}
                    aria-hidden="true"
                />
            </button>
        );
    }

    renderContent(content) {
        return (
            <MarkdownViewer markdown={content} truncate={this.props.truncate} />
        );
    }

    render() {
        return (
            <div
                className={`white-box overview-box ${
                    this.state.isExpanded ? "is-expanded" : ""
                }`}
            >
                {this.props.content && this.renderContent(this.props.content)}
                {this.state.showToggle &&
                    this.renderToggle(this.state.isExpanded)}
            </div>
        );
    }
}

export default OverviewBox;
