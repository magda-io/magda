import React from "react";
import { connect } from "react-redux";
import { requestAuthProviders } from "../../actions/userManagementActions";
import MagdaDocumentTitle from "../i18n/MagdaDocumentTitle";
import { bindActionCreators } from "redux";
import Breadcrumbs from "../../UI/Breadcrumbs";
import { Medium } from "../../UI/Responsive";
import { UIPreviewerManager } from "../../helpers/UIPreviewer";

class Settings extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            inputContent: "Please input content API DB record json here...",
            previewerData: null
        };
        this.uiPreviewerManager = null;
    }

    render() {
        return (
            <MagdaDocumentTitle prefixes={["Settings"]}>
                <div className="settings">
                    <Medium>
                        <Breadcrumbs
                            breadcrumbs={[
                                <li key="settings">
                                    <span>Settings</span>
                                </li>
                            ]}
                        />
                    </Medium>
                    <div>
                        <br />
                        <div>
                            <button
                                class="au-btn"
                                onClick={() => {
                                    this.uiPreviewerManager = new UIPreviewerManager();
                                    window.uiPreviewerManager = this.uiPreviewerManager;
                                    this.uiPreviewerManager.openPreviewWindow();
                                }}
                            >
                                Open Preview Window
                            </button>
                        </div>
                        <br />
                        <textarea
                            cols="130"
                            rows="28"
                            onChange={event => {
                                this.setState({
                                    inputContent: event.target.value
                                });
                            }}
                            value={this.state.inputContent}
                        />
                        <br />
                        <button
                            class="au-btn"
                            onClick={() => {
                                if (!this.uiPreviewerManager) {
                                    alert(
                                        "You need to open the previewer window first..."
                                    );
                                    return;
                                }
                                try {
                                    const data = JSON.parse(
                                        this.state.inputContent
                                    );
                                    if (!data.id) {
                                        throw new Error(
                                            "setting record must have a `id` field."
                                        );
                                    }
                                    if (!data.content) {
                                        throw new Error(
                                            "setting record must have a `content` field."
                                        );
                                    }
                                    if (!data.type) {
                                        throw new Error(
                                            "setting record must have a `type` field."
                                        );
                                    }
                                    const previewTarget = this
                                        .uiPreviewerManager.previewTarget;
                                    previewTarget.contentStore.setRecord(data);
                                    previewTarget.dispatch(
                                        previewTarget.actions.contentActions
                                            .requestContentReset
                                    );
                                    previewTarget.reloadLang();
                                    previewTarget.dispatch(
                                        previewTarget.actions.staticPagesActions
                                            .requestStaticPageResetAll
                                    );
                                    previewTarget.dispatch(
                                        previewTarget.actions.contentActions
                                            .fetchContent
                                    );
                                    previewTarget.dispatch(
                                        previewTarget.actions.staticPagesActions
                                            .fetchStaticPage,
                                        "about"
                                    );
                                    previewTarget.dispatch(
                                        previewTarget.actions.staticPagesActions
                                            .fetchStaticPage,
                                        "privacy-policy"
                                    );
                                    previewTarget.dispatch(
                                        previewTarget.actions.staticPagesActions
                                            .fetchStaticPage,
                                        "dataset-quality"
                                    );
                                    previewTarget.refresh();
                                } catch (e) {
                                    alert(`Error: ${e}`);
                                }
                            }}
                        >
                            Send Setting Record to Preview Window
                        </button>
                        &nbsp;&nbsp;&nbsp;&nbsp;
                        <button
                            class="au-btn"
                            onClick={() => {
                                if (!this.uiPreviewerManager) {
                                    alert(
                                        "You need to open the previewer window first..."
                                    );
                                    return;
                                }
                                this.setState({
                                    previewerData: this.uiPreviewerManager.previewTarget.contentStore.getData()
                                });
                            }}
                        >
                            Get Previewer Setting Data
                        </button>
                    </div>
                    {this.state.previewerData ? (
                        <div
                            style={{
                                marginTop: "20px"
                            }}
                        >
                            <textarea
                                cols="130"
                                rows="28"
                                value={JSON.stringify(
                                    this.state.previewerData,
                                    null,
                                    4
                                )}
                            />
                        </div>
                    ) : null}
                </div>
            </MagdaDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    let {
        userManagement: { user, providers, providersError }
    } = state;

    return {
        user,
        providers,
        providersError,
        strings: state.content.strings
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            requestAuthProviders
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Settings);
