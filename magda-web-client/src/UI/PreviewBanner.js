import { bindActionCreators } from "redux";

import React from "react";
import { connect } from "react-redux";
import "./PreviewBanner.css";
import { togglePreviewBanner } from "../actions/previewBanner";

function PreviewBanner(props) {
    if (props.isShown) {
        return (
            <div className="preview-banner au-body">
                <span>
                    This window is in `Preview` Mode. Alter its looking &amp;
                    feels from the setting areas.
                </span>
                <button
                    type="button"
                    className="close-btn"
                    onClick={() => {
                        props.togglePreviewBanner();
                    }}
                />
            </div>
        );
    }
    return null;
}

function mapStateToProps(state, ownProps) {
    return {
        isShown: state.previewBanner.isShown
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            togglePreviewBanner: togglePreviewBanner
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PreviewBanner);
