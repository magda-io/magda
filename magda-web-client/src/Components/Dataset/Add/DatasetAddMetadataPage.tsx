import React from "react";
import { withRouter, match } from "react-router-dom";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";

import ToolTip from "Components/Dataset/Add/ToolTip";
import AsyncButton from "Components/Common/AsyncButton";

import {
    createNewDatasetReset,
    createNewDatasetError
} from "actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import {
    addDatasetSteps as ProgressMeterStepsConfig,
    stepMap
} from "../../Common/AddDatasetProgressMeter";

import {
    State,
    saveState,
    DistributionState,
    submitDatasetFromState
} from "./DatasetAddCommon";
import DetailsAndContents from "./Pages/DetailsAndContents";
import DatasetAddPeoplePage from "./Pages/People/DatasetAddPeoplePage";
import DatasetAddEndPreviewPage from "./Pages/DatasetAddEndPreviewPage";
import DatasetAddEndPage from "./Pages/DatasetAddEndPage";
import DatasetAddFilesPage from "./Pages/AddFiles";
import ReviewPage from "./Pages/ReviewPage/index";
import DatasetAddAccessAndUsePage from "./Pages/DatasetAddAccessAndUsePage";
import withAddDatasetState from "./withAddDatasetState";
import { config } from "config";

import "./DatasetAddMetadataPage.scss";
import "./DatasetAddCommon.scss";

import ReviewFilesList from "./ReviewFilesList";

import ErrorMessageBox from "Components/Common/ErrorMessageBox";

import helpIcon from "assets/help.svg";
import { User } from "reducers/userManagementReducer";
import * as ValidationManager from "../Add/ValidationManager";
import urijs from "urijs";
import FileDeletionError from "helpers/FileDeletionError";
import redirect from "helpers/redirect";
import Loader from "rsuite/Loader";

type Props = {
    initialState: State;
    createRecord: Function;
    createNewDatasetReset: Function;
    createNewDatasetError: Function;
    creationError: any;
    lastDatasetId: string;
    step: number;
    datasetId: string;
    history: any;
    user: User;
    isBackToReview: boolean;
    match: match;
    location: any;
};

class NewDataset extends React.Component<Props, State> {
    state: State = this.props.initialState;

    constructor(props) {
        super(props);
        ValidationManager.setStateDataGetter(() => {
            return this.state;
        });
    }

    steps: Array<any> = [
        () => (
            <DatasetAddFilesPage
                edit={this.edit}
                setState={this.setState.bind(this)}
                datasetId={this.props.datasetId}
                stateData={this.state}
                user={this.props.user}
            />
        ),
        () => (
            <DetailsAndContents
                edit={this.edit}
                setState={this.setState.bind(this)}
                stateData={this.state}
                user={this.props.user}
                isEditView={false}
            />
        ),
        () => (
            <DatasetAddPeoplePage
                edit={this.edit}
                dataset={this.state.dataset}
                publishing={this.state.datasetPublishing}
                provenance={this.state.provenance}
                user={this.props.user}
                isEditView={false}
            />
        ),
        () => (
            <DatasetAddAccessAndUsePage
                edit={this.edit}
                editState={this.editState}
                stateData={this.state}
                editStateWithUpdater={this.setState.bind(this)}
                isEditView={false}
            />
        ),
        this.renderSubmitPage.bind(this),
        () => (
            <ReviewPage
                stateData={this.state}
                editStateWithUpdater={this.setState.bind(this)}
                isEditView={false}
            />
        ),
        config.featureFlags.previewAddDataset
            ? () => <DatasetAddEndPreviewPage />
            : () => (
                  <DatasetAddEndPage
                      datasetId={this.props.datasetId}
                      history={this.props.history}
                      isEdit={false}
                      publishStatus={this.state.datasetPublishing.state}
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
            ? step >= stepMap.REVIEW
            : step >= stepMap.REVIEW_BEFORE_SUBMIT;

        const nextButtonCaption = () => {
            if (step === stepMap.REVIEW_BEFORE_SUBMIT) {
                // --- review page
                if (config.featureFlags.datasetApprovalWorkflowOn) {
                    if (this.state.isPublishing) {
                        return "Publishing as draft...";
                    } else {
                        return "Publish draft dataset";
                    }
                } else {
                    if (this.state.isPublishing) {
                        return "Publishing...";
                    } else {
                        return "Publish dataset";
                    }
                }
            } else if (step === stepMap.ALL_DONE) {
                // --- all done or preview mode feedback page
                // --- All done page has no button to show
                return "Send Us Your Thoughts";
            } else {
                return "Next: " + ProgressMeterStepsConfig[step + 1].title;
            }
        };

        const nextButtonOnClick = async () => {
            if (step === stepMap.REVIEW_BEFORE_SUBMIT) {
                // --- review page
                if (config.featureFlags.previewAddDataset) {
                    await this.gotoStep(step + 1);
                } else {
                    await this.performPublishDataset();
                }
            } else if (step === stepMap.ALL_DONE) {
                // --- all done or preview mode feedback page
                if (config.featureFlags.previewAddDataset) {
                    // --- preview mode feedback page
                    window.location.href =
                        "mailto:magda@csiro.au?subject=Add Dataset Feedback";
                }
            } else {
                await this.gotoStep(step + 1);
            }
        };

        const shouldRenderButtonArea = () => {
            if (
                distributions.filter(
                    (item) => item._state !== DistributionState.Ready
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
                {step > 0 && step < 5 ? (
                    <div className="row">
                        <div className="col-sm-12">
                            <ReviewFilesList
                                key={step}
                                files={distributions}
                                isOpen={step < 1 ? true : false}
                            />
                        </div>
                    </div>
                ) : null}

                {this.steps[step]()}
                <br />
                <br />
                <ErrorMessageBox
                    scrollIntoView={false}
                    stateErrorGetter={(state) =>
                        state?.record?.newDataset?.error
                            ? state.record.newDataset.error
                            : null
                    }
                />
                <br />
                {!shouldRenderButtonArea() ? null : (
                    <>
                        <div className="row next-save-button-row">
                            <div className="col-sm-12">
                                {this.props.isBackToReview ? (
                                    <AsyncButton
                                        className="au-btn back-to-review-button"
                                        onClick={async () =>
                                            await this.gotoStep(
                                                this.steps.length - 2
                                            )
                                        }
                                    >
                                        Return to Review
                                    </AsyncButton>
                                ) : null}

                                <AsyncButton
                                    className={`au-btn ${
                                        this.props.isBackToReview
                                            ? "au-btn--secondary save-button"
                                            : "next-button"
                                    }`}
                                    onClick={nextButtonOnClick}
                                    disabled={this.state.isPublishing}
                                >
                                    {nextButtonCaption()}
                                </AsyncButton>
                                {hideExitButton ? null : (
                                    <AsyncButton
                                        className="au-btn au-btn--secondary save-button"
                                        onClick={this.saveAndExit.bind(this)}
                                    >
                                        Save and exit without publishing
                                    </AsyncButton>
                                )}
                                {this.state.isPublishing ? (
                                    <Loader content="Submit dataset, please wait..." />
                                ) : null}
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

    async saveAndExit() {
        try {
            await this.resetError();
            await saveState(this.state, this.props.datasetId);

            if (config?.featureFlags?.previewAddDataset) {
                // --- still redirect to dataset list page in preview wmdoe
                redirect(this.props.history, `/dataset/list`);
            } else {
                // redirect to datasets management
                redirect(this.props.history, `/settings/datasets/draft`);
            }
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
    }

    async gotoStep(step: number) {
        // Bandaid: So that users can't force their way into the approval page
        if (
            !config.featureFlags.datasetApprovalWorkflowOn &&
            step === stepMap.REVIEW
        ) {
            step = stepMap.REVIEW_BEFORE_SUBMIT;
        }

        try {
            /**
             * await here is for fixing a weird bug that causing input ctrl with validation error can't be moved into viewport
             * Until we find the root cause of this problem, resetError() must be called with await
             */
            await this.resetError();
            if (ValidationManager.validateAll()) {
                await saveState(this.state, this.props.datasetId);
                redirect(
                    this.props.history,
                    "/dataset/add/metadata/" +
                        encodeURIComponent(this.props.datasetId) +
                        "/" +
                        step
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
            const datasetId = this.props.datasetId;

            await this.resetError();

            this.setState((state) => ({
                ...state,
                isPublishing: true,
                datasetPublishing: {
                    ...state.datasetPublishing,
                    state: "published"
                }
            }));

            const result = await submitDatasetFromState(
                datasetId,
                {
                    ...this.state,
                    datasetPublishing: {
                        ...this.state.datasetPublishing,
                        state: "published"
                    }
                },
                this.setState.bind(this)
            );

            if (result.length) {
                throw new FileDeletionError(result);
            }
            redirect(
                this.props.history,
                `/dataset/add/metadata/${encodeURIComponent(datasetId)}/6`
            );
        } catch (e) {
            this.setState({
                isPublishing: false
            });
            this.props.createNewDatasetError(e);
        }
    }
}

function mapStateToProps(state, props) {
    const uri = urijs(window.location.href);
    const datasetId = props?.match?.params?.datasetId;
    let step = parseInt(props?.match?.params?.step);
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

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            createNewDatasetReset: createNewDatasetReset,
            createNewDatasetError: createNewDatasetError
        },
        dispatch
    );
};

export default withAddDatasetState(
    connect(mapStateToProps, mapDispatchToProps)(withRouter(NewDataset))
);
