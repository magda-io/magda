import React, { Component } from "react";
import "./ToggleList.css";
import Button from "muicss/lib/react/button";

class ToggleList extends Component {
    constructor(props) {
        super(props);
        this.onClick = this.onClick.bind(this);
        this.state = {
            isExpanded: false
        };
    }

    onClick() {
        this.setState({
            isExpanded: !this.state.isExpanded
        });
    }

    render() {
        let defaultLength = this.props.defaultLength;
        let list = this.props.list;
        let tempSize =
            defaultLength > list.length ? list.length : defaultLength;
        let size = this.state.isExpanded ? list.length : tempSize;
        return (
            <ul
                className={`mui-list--unstyled toggle-list ${
                    this.props.className
                }`}
            >
                {list
                    .slice(0, size)
                    .map(o => (
                        <li key={this.props.getKey(o)}>
                            {this.props.renderFunction(o)}
                        </li>
                    ))}
                {list.length - tempSize > 0 && (
                    <li>
                        <Button onClick={this.onClick}>
                            {this.state.isExpanded
                                ? `Show less`
                                : `+ Show ${list.length - tempSize} more`}
                        </Button>
                    </li>
                )}
            </ul>
        );
    }
}

export default ToggleList;
