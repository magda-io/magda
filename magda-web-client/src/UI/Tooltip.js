import "./Tooltip.css";

import React from "react";

/**
 * @description Return a information tooltip, on hover show calculation method.
 * @returns { div }
 */
class Tooltip extends React.Component {
    state = {
        offset: 0
    };

    constructor(props) {
        super(props);

        this.rootRef = React.createRef();
        this.tooltipTextElementRef = React.createRef();
    }

    componentDidMount() {
        this.adjustOffset();
    }

    componentDidUpdate() {
        this.adjustOffset();
    }

    adjustOffset() {
        const tooltipTextElement = this.tooltipTextElementRef.current;
        const rootElement = this.rootRef.current;
        const launcherElement = rootElement.firstChild;

        const launcherElementStyle =
            launcherElement.currentStyle ||
            window.getComputedStyle(launcherElement);

        const offset =
            (tooltipTextElement.offsetWidth +
                parseFloat(launcherElementStyle.marginLeft) +
                parseFloat(launcherElementStyle.marginRight) -
                parseFloat(launcherElementStyle.paddingRight) -
                parseFloat(launcherElementStyle.paddingLeft)) /
            2;

        if (this.state.offset !== offset) {
            this.setState({
                offset
            });
        }
    }

    render() {
        return (
            <div
                ref={this.rootRef}
                className={`tooltip ${
                    this.props.className ? this.props.className : ""
                }`}
            >
                {this.props.launcher && <this.props.launcher />}
                <span
                    className="tooltiptext"
                    ref={this.tooltipTextElementRef}
                    style={{ marginLeft: "-" + this.state.offset + "px" }}
                >
                    {this.props.children}
                </span>
            </div>
        );
    }
}

export default Tooltip;
