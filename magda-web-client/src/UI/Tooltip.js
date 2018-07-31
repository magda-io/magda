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
        this.rootElementRef = React.createRef();
    }

    componentDidMount() {
        this.adjustOffset();
    }

    componentDidUpdate() {
        this.adjustOffset();
    }

    adjustOffset() {
        const element = this.rootElementRef.current;
        const style = element.currentStyle || window.getComputedStyle(element);
        const offsetWidth =
            (element.offsetWidth +
                parseFloat(style.marginLeft) +
                parseFloat(style.marginRight)) /
            2;

        if (this.state.offset !== offsetWidth) {
            this.setState({
                offset: offsetWidth
            });
        }
    }

    render() {
        return (
            <div
                className={`tooltip ${
                    this.props.className ? this.props.className : ""
                }`}
            >
                {this.props.launcher && this.props.launcher()}
                <span
                    className="tooltiptext"
                    ref={this.rootElementRef}
                    style={{ marginLeft: "-" + this.state.offset + "px" }}
                >
                    {this.props.children}
                </span>
            </div>
        );
    }
}

export default Tooltip;
