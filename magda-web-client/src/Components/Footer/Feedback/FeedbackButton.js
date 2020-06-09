import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import { showFeedbackForm } from "actions/feedbackActions";

import feedback from "assets/feedback.svg";

import "./FeedbackButton.scss";

function RawFeedbackButton(props) {
    return (
        <div className="feedback-button-wrapper">
            <button
                className="feedback-button au-btn"
                onClick={props.showFeedbackForm}
            >
                <img alt="feedback" src={feedback} />
                Give feedback
            </button>
        </div>
    );
}

function RawFeedbackLink(props) {
    return <a onClick={props.showFeedbackForm}>{props.caption}</a>;
}

function mapStateToProps({ feedback: { isShowingFeedbackForm } }) {
    return {
        isShowingFeedbackForm
    };
}

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            showFeedbackForm
        },
        dispatch
    );
};

export const FeedbackButton = connect(
    mapStateToProps,
    mapDispatchToProps
)(RawFeedbackButton);
export const FeedbackLink = connect(
    mapStateToProps,
    mapDispatchToProps
)(RawFeedbackLink);
