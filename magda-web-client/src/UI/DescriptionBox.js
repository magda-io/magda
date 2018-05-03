import React, { Component } from "react";
import PropTypes from "prop-types";
import MarkdownViewer, { willBeTruncated } from "../UI/MarkdownViewer";
import "./DescriptionBox.css";
import downArrowIcon from "../assets/downArrow.svg";
import upArrowIcon from "../assets/upArrow.svg";

class DescriptionBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isExpanded: false
        };
    }

    onToggleButtonClick(e) {
        e.preventDefault();
        this.setState({
            isExpanded: !this.state.isExpanded
        });
    }

    render() {
        const shouldShowToggleButton = this.props.isAutoTruncate
            ? willBeTruncated(this.props.content, this.props.truncateLength)
            : false;
        return (
            <div
                itemProp="description"
                className={`description-box white-box overview-box ${
                    this.state.isExpanded ? "is-expanded" : ""
                }`}
            >
                <MarkdownViewer
                    markdown={this.props.content}
                    truncate={
                        !this.state.isExpanded && this.props.isAutoTruncate
                    }
                    truncateLength={this.props.truncateLength}
                />
                {shouldShowToggleButton ? (
                    this.state.isExpanded ? (
                        <button
                            className="toggle-button"
                            onClick={e => this.onToggleButtonClick(e)}
                        >
                            <span>Show less description</span>
                            <img src={upArrowIcon} alt="upArrowIcon" />
                        </button>
                    ) : (
                        <button
                            className="toggle-button"
                            onClick={e => this.onToggleButtonClick(e)}
                        >
                            <span>Show full description</span>
                            <img src={downArrowIcon} alt="downArrow" />
                        </button>
                    )
                ) : null}
            </div>
        );
    }
}

DescriptionBox.propTypes = {
    isAutoTruncate: PropTypes.bool,
    truncateLength: PropTypes.number,
    content: PropTypes.string
};

DescriptionBox.defaultProps = {
    isAutoTruncate: true,
    truncateLength: 500,
    content: ""
};

export default DescriptionBox;
