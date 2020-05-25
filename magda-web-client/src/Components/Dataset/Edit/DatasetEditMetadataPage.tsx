import React from "react";
import { withRouter } from "react-router";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";

import ToolTip from "Components/Dataset/Add/ToolTip";

import {
    createNewDatasetReset,
    createNewDatasetError
} from "actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import {
    editDatasetSteps as ProgressMeterStepsConfig,
    stepMap
} from "../../Common/AddDatasetProgressMeter";

import {
    State,
    DistributionState,
    updateDatasetFromState
} from "../Add/DatasetAddCommon";
import DetailsAndContents from "../Add/Pages/DetailsAndContents";
import DatasetAddPeoplePage from "../Add/Pages/People/DatasetAddPeoplePage";
import DatasetAddEndPreviewPage from "../Add/Pages/DatasetAddEndPreviewPage";
import DatasetAddFilesPage from "../Add/Pages/AddFiles";
import DatasetAddAccessAndUsePage from "../Add/Pages/DatasetAddAccessAndUsePage";
import ReviewPage from "../Add/Pages/ReviewPage/index";
import DatasetAddEndPage from "../Add/Pages/DatasetAddEndPage";
import withEditDatasetState from "./withEditDatasetState";
import { config } from "config";

import "../Add/DatasetAddMetadataPage.scss";
import "../Add/DatasetAddCommon.scss";
import ErrorMessageBox from "../Add/ErrorMessageBox";

import helpIcon from "assets/help.svg";
import { User } from "reducers/userManagementReducer";
import * as ValidationManager from "../Add/ValidationManager";
import URI from "urijs";

type Props = {
    initialState: State;
    createNewDatasetReset: Function;
    createNewDatasetError: Function;
    isCreating: boolean;
    creationError: any;
    lastDatasetId: string;
    step: number;
    datasetId: string;
    isNewDataset: boolean;
    history: any;
    user: User;
    isBackToReview: boolean;
};

class EditDataset extends React.Component<Props, State> {
    state: State = this.props.initialState;

    constructor(props) {
        super(props);
        ValidationManager.setStateDataGetter(() => {
            return this.state;
        });
    }

    steps: any = [
        () => (
            <DatasetAddFilesPage
                edit={this.edit}
                setState={this.setState.bind(this)}
                stateData={this.state}
                user={this.props.user}
                isEditView={true}
            />
        ),
        () => (
            <DetailsAndContents
                edit={this.edit}
                setState={this.setState.bind(this)}
                stateData={this.state}
                user={this.props.user}
                isEditView={true}
            />
        ),
        () => (
            <DatasetAddPeoplePage
                edit={this.edit}
                dataset={this.state.dataset}
                publishing={this.state.datasetPublishing}
                provenance={this.state.provenance}
                user={this.props.user}
                isEditView={true}
            />
        ),
        () => (
            <DatasetAddAccessAndUsePage
                edit={this.edit}
                editState={this.editState}
                stateData={this.state}
                editStateWithUpdater={this.setState.bind(this)}
                isEditView={true}
            />
        ),
        this.renderSubmitPage.bind(this),
        () => <ReviewPage stateData={this.state} />,
        config.featureFlags.previewAddDataset
            ? () => <DatasetAddEndPreviewPage />
            : () => (
                  <DatasetAddEndPage
                      datasetId={this.props.datasetId}
                      history={this.props.history}
                      isEdit={true}
                  />
              )
    ];

    edit = <K extends keyof State>(aspectField: K) => (field: string) => (
        newValue: any
    ) => {
        this.setState((state: any) => {
            return {
                [aspectField]: { ...state[aspectField], [field]: newValue }
            } as Pick<State, K>;
        });
    };

    editState = <K extends keyof State>(field: K) => (newValue: any) => {
        this.setState({ [field]: newValue } as Pick<State, K>);
    };

    render() {
        const { distributions } = this.state;
        let { step } = this.props;

        const hideExitButton = config.featureFlags.previewAddDataset
            ? step >= stepMap.SUBMIT_FOR_APPROVAL
            : step >= stepMap.REVIEW;

        const nextButtonCaption = () => {
            if (step === stepMap.REVIEW) {
                // --- review page
                if (this.state.isPublishing) {
                    return "Submit dataset changes...";
                } else {
                    return "Submit dataset changes";
                }
            } else if (step === stepMap.ALL_DONE) {
                // --- all done or preview mode feedback page
                // --- All done page has no button to show
                return "Send Us Your Thoughts";
            } else {
                return "Next: " + ProgressMeterStepsConfig[step + 1].title;
            }
        };

        const nextButtonOnClick = () => {
            if (step === stepMap.REVIEW) {
                // --- review page
                if (config.featureFlags.previewAddDataset) {
                    this.gotoStep(step + 1);
                } else {
                    this.performPublishDataset();
                }
            } else if (step === stepMap.ALL_DONE) {
                // --- all done or preview mode feedback page
                if (config.featureFlags.previewAddDataset) {
                    // --- preview mode feedback page
                    window.location.href =
                        "mailto:magda@csiro.au?subject=Add Dataset Feedback";
                }
            } else {
                this.gotoStep(step + 1);
            }
        };

        const shouldRenderButtonArea = () => {
            if (
                distributions.filter(
                    item => item._state !== DistributionState.Ready
                ).length
            ) {
                return false;
            }
            if (
                step === stepMap.ALL_DONE &&
                !config.featureFlags.previewAddDataset
            ) {
                return false;
            } else {
                return true;
            }
        };

        return (
            <div className="dataset-add-files-root dataset-add-meta-data-pages">
                {this.steps[step]()}
                <br />
                <br />
                <ErrorMessageBox />
                <br />
                {!shouldRenderButtonArea() ? null : (
                    <>
                        <div className="row next-save-button-row">
                            <div className="col-sm-12">
                                {this.props.isBackToReview ? (
                                    <button
                                        className="au-btn back-to-review-button"
                                        onClick={() =>
                                            this.gotoStep(this.steps.length - 2)
                                        }
                                    >
                                        Return to Review
                                    </button>
                                ) : null}

                                <button
                                    className={`au-btn ${
                                        this.props.isBackToReview
                                            ? "au-btn--secondary save-button"
                                            : "next-button"
                                    }`}
                                    onClick={nextButtonOnClick}
                                    disabled={this.state.isPublishing}
                                >
                                    {nextButtonCaption()}
                                </button>
                                {hideExitButton ? null : (
                                    <button
                                        className="au-btn au-btn--secondary save-button"
                                        onClick={() =>
                                            this.gotoStep(this.steps.length - 2)
                                        }
                                    >
                                        Review &amp; Save
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    resetError() {
        this.props.createNewDatasetReset();
    }

    async gotoStep(step) {
        try {
            await this.resetError();
            if (ValidationManager.validateAll()) {
                this.props.history.push(
                    `/dataset/edit/${this.props.datasetId}/${step}`
                );
            }
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
    }

    renderSubmitPage() {
        const { datasetPublishing } = this.state;
        return (
            <div className="row dataset-submit-page">
                <div className="col-sm-12">
                    <h2 className="with-underline">
                        Additional notes or comments
                    </h2>
                    <h3>
                        Optional space to leave a note for the dataset Approver
                    </h3>
                    <ToolTip icon={helpIcon}>
                        Leave any additional comments you feel are relevant to
                        this dataset
                    </ToolTip>
                    <div>
                        <MultilineTextEditor
                            value={datasetPublishing.notesToApprover}
                            placeholder="Enter additional notes"
                            onChange={this.edit("datasetPublishing")(
                                "notesToApprover"
                            )}
                        />
                    </div>
                </div>
            </div>
        );
    }

    async performPublishDataset() {
        try {
            await this.resetError();

            this.setState({
                isPublishing: true
            });

            await updateDatasetFromState(
                this.props.datasetId,
                this.state,
                this.setState.bind(this)
            );

            this.props.history.push(`/dataset/edit/${this.props.datasetId}/6`);
        } catch (e) {
            this.setState({
                isPublishing: false
            });
            this.props.createNewDatasetError(e);
        }
    }
}

function mapStateToProps(state, props) {
    const uri = new URI(location.href);
    const datasetId = props.match.params.datasetId;
    let step = parseInt(props.match.params.step);
    const isBackToReview =
        typeof uri.search(true)?.isBackToReview !== "undefined" ? true : false;

    if (isNaN(step)) {
        step = 0;
    }

    return {
        datasetId,
        step,
        isBackToReview
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            createNewDatasetReset: createNewDatasetReset,
            createNewDatasetError: createNewDatasetError
        },
        dispatch
    );
};

export default withEditDatasetState(
    withRouter(connect(mapStateToProps, mapDispatchToProps)(EditDataset))
);
