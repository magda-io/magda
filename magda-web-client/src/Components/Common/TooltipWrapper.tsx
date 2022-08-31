import React from "react";

import "./TooltipWrapper.scss";

type Props = {
    /** Does this require a click outside the tooltip to dismiss, or should it disappear after a delay?  */
    requireClickToDismiss?: boolean;
    /** Invoked when the tooltip is dismissed by the user - not called if the tooltip disappears automatically  */
    onDismiss?: () => void;
    /** Classname to apply to the wrapper element */
    className?: string;
    /** Whether the tooltip should start in an open state */
    startOpen?: boolean;
    /** Whether the tooltip should show up above or below the element it wraps */
    orientation?: "below" | "above";
    /**
     * A function that returns a component that should launch the tooltip. If startOpen is false then it will show
     * the tooltip when hovered over. Accepts an "open" callback that can be used to force-launch the tooltip (e.g. on click) */
    launcher?: (launch?: () => void) => React.ReactNode;
    /** Class to apply to the  actual tooltip */
    innerElementClassName?: string;
    /** The tooltip content itself, as higher-order function that provides a function to dismiss the tooltip */
    children: (dismiss: () => void) => React.ReactNode;
};

type State = {
    offset: number;
    open: boolean;
};

/**
 * @description Return a information tooltip, on hover show calculation method.
 */
class TooltipWrapper extends React.Component<Props, State> {
    rootRef = React.createRef<HTMLDivElement>();
    tooltipTextElementRef = React.createRef<HTMLSpanElement>();
    state = {
        offset: 0,
        open: !!this.props.startOpen
    };

    componentDidMount() {
        document.addEventListener("mousedown", this.dismiss);
        document.addEventListener("touchstart", this.dismiss);

        this.adjustOffset();
    }

    componentDidUpdate() {
        this.adjustOffset();
    }

    componentWillUnmount() {
        document.removeEventListener("mousedown", this.dismiss);
        document.addEventListener("touchstart", this.dismiss);
    }

    dismiss = () => {
        this.props.onDismiss && this.props.onDismiss();
        this.setState({ open: false });
    };

    /**
     * Adjust the offset margin of the tooltiptext so it's at the centre of the launcher.
     */
    adjustOffset() {
        const tooltipTextElement = this.tooltipTextElementRef.current;
        const rootElement = this.rootRef.current;

        // Why .firstChild? Because we can't attach a ref to a render prop unless whatever's passed in passes the ref through to its first dom element
        const launcherElement = rootElement!.firstChild!;

        const launcherElementStyle =
            (launcherElement as any).currentStyle ||
            window.getComputedStyle(launcherElement as Element);

        const tooltipWidth = tooltipTextElement!.offsetWidth;
        const offset =
            (tooltipWidth +
                parseFloat(launcherElementStyle.marginLeft) +
                parseFloat(launcherElementStyle.marginRight) -
                parseFloat(launcherElementStyle.paddingRight) -
                parseFloat(launcherElementStyle.paddingLeft)) /
            2;
        // only update if the difference is big enough to prevent indefinite loop caused by browser sub pixel error
        if (Math.abs(this.state.offset - offset) > 5) {
            this.setState({
                offset: offset
            });
        }
    }

    forceOpen = () => {
        this.setState({
            open: true
        });
    };

    render() {
        const className = this.props.className ? this.props.className : "";
        const openClass = this.state.open ? "tooltip-open" : "";
        const orientationClassName =
            this.props.orientation === "below"
                ? "tooltiptext-below"
                : "tooltiptext-above";

        return (
            <div
                ref={this.rootRef}
                className={`tooltip ${className} ${openClass} `}
            >
                {/* Caution: if this is ever not the first element be sure to fix adjustOffset */}
                {this.props.launcher && this.props.launcher(this.forceOpen)}
                <span
                    className={`tooltiptext ${orientationClassName} ${
                        this.props.innerElementClassName || ""
                    }`}
                    ref={this.tooltipTextElementRef}
                    style={{ marginLeft: "-" + this.state.offset + "px" }}
                >
                    {this.props.children(this.dismiss)}
                </span>
            </div>
        );
    }
}

export default TooltipWrapper;
