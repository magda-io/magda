import React from "react";

class Reveal extends React.Component<
    { label: string; children?: React.ReactNode },
    { reveal: boolean }
> {
    static defaultProps = {
        label: "Click to reveal"
    };

    state = { reveal: false };

    onRevealButtonClick = () => {
        this.setState({
            reveal: true
        });
    };

    render() {
        const { reveal } = this.state;
        const { children, label } = this.props;
        return (
            <React.Fragment>
                {reveal ? (
                    children
                ) : (
                    <button
                        className="au-btn au-btn--secondary"
                        onClick={this.onRevealButtonClick}
                    >
                        <span>{label}</span>
                    </button>
                )}
            </React.Fragment>
        );
    }
}

export default Reveal;
