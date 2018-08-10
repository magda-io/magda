import "./Tooltip.css";

import React from "react";

/**
 * @description Return a information tooltip, on hover show calculation method.
 * @returns { div }
 */
class Tooltip extends React.Component {
    constructor(props) {
        super(props);

        this.rootRef = React.createRef();
        this.tooltipTextElementRef = React.createRef();
        this.state = {
            offset: 0,
            dismissed: false,
            tooltipWidth: 0
        };
    }

    componentDidMount() {
        if (this.props.requireClickToDismiss) {
            document.addEventListener("mousedown", this.handleClickOutside);
        }
        this.updateTooltipWidthState();
        this.adjustOffset();
    }

    componentDidUpdate() {
        this.updateTooltipWidthState();
        this.adjustOffset();
    }

    componentWillUnmount() {
        if (this.props.requireClickToDismiss) {
            document.removeEventListener("mousedown", this.handleClickOutside);
        }
    }

    updateTooltipWidthState() {
        const tooltipWidth = this.tooltipTextElementRef.current.offsetWidth;
        // set tooltip width if it not set or not very different, prevent resetting due to browser difference
        if (
            !this.state.tooltipWidth ||
            Math.abs(tooltipWidth - this.state.tooltipWidth) > 5
        ) {
            this.setState({
                tooltipWidth: this.tooltipTextElementRef.current.offsetWidth
            });
        }
    }

    handleClickOutside = event => {
        if (!this.rootRef.current.contains(event.target)) {
            this.dismiss();
        }
    };

    dismiss = () => {
        this.props.onDismiss && this.props.onDismiss();
        this.setState({ dismissed: true });
    };

    /**
     * Adjust the offset margin of the tooltiptext so it's at the centre of the launcher.
     */
    adjustOffset() {
        const tooltipTextElement = this.tooltipTextElementRef.current;
        const rootElement = this.rootRef.current;

        // Why .firstChild? Because we can't attach a ref to a render prop unless whatever's passed in passes the ref through to its first dom element
        const launcherElement = rootElement.firstChild;

        const launcherElementStyle =
            launcherElement.currentStyle ||
            window.getComputedStyle(launcherElement);

        const tooltipWidth = this.state.tooltipWidth;
        const offset =
            (tooltipWidth +
                parseFloat(launcherElementStyle.marginLeft) +
                parseFloat(launcherElementStyle.marginRight) -
                parseFloat(launcherElementStyle.paddingRight) -
                parseFloat(launcherElementStyle.paddingLeft)) /
            2;

        if (this.state.offset !== offset) {
            this.setState({
                offset: offset
            });
        }
    }

    render() {
        const className = this.props.className ? this.props.className : "";
        const openClass =
            this.props.startOpen && !this.state.dismissed ? "tooltip-open" : "";
        const orientationClassName =
            this.props.orientation === "below"
                ? "tooltiptext-below"
                : "tooltiptext-above";

        return (
            <div
                ref={this.rootRef}
                className={`tooltip ${className} ${openClass} ${
                    this.state.dismissed ? "tooltip-dismissed" : ""
                }`}
            >
                {/* Caution: if this is ever not the first element be sure to fix adjustOffset */}
                {this.props.launcher && <this.props.launcher />}
                <span
                    className={`tooltiptext ${orientationClassName} ${this.props
                        .innerElementClassName || ""}`}
                    ref={this.tooltipTextElementRef}
                    style={{ marginLeft: "-" + this.state.offset + "px" }}
                >
                    {this.props.children(this.dismiss)}
                </span>
            </div>
        );
    }
}

export default Tooltip;
