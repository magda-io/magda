import React from "react";
import PropTypes from "prop-types";

class Reveal extends React.Component {
    state = { reveal: false };

    onRevealButtonClick = () => {
        this.setState({
            reveal: true
        });
    };

    render() {
        return (
            <React.Fragment ns={["datasetPage"]}>
                {this.state.reveal ? (
                    this.props.children
                ) : (
                    <button
                        className="au-btn au-btn--secondary"
                        onClick={this.onRevealButtonClick}
                    >
                        <span>{this.props.label}</span>
                    </button>
                )}
            </React.Fragment>
        );
    }
}

Reveal.propTypes = {
    label: PropTypes.string
};

Reveal.defaultProps = {
    label: "Click to reveal"
};

export default Reveal;
