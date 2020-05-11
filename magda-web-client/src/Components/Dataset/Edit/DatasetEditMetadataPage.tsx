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

import { editSteps as ProgressMeterStepsConfig } from "../../Common/AddDatasetProgressMeter";

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
};

class NewDataset extends React.Component<Props, State> {
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

        step = Math.max(Math.min(step, this.steps.length - 1), 0);

        const hideExitButton = config.featureFlags.previewAddDataset
            ? step >= 4
            : step >= 5;

        const nextButtonCaption = () => {
            if (step === 5) {
                // --- review page
                if (this.state.isPublishing) {
                    return "Submit dataset changes...";
                } else {
                    return "Submit dataset changes";
                }
            } else if (step === 6) {
                // --- all done or preview mode feedback page
                // --- All done page has no button to show
                return "Send Us Your Thoughts";
            } else {
                return "Next: " + ProgressMeterStepsConfig[step + 1].title;
            }
        };

        const nextButtonOnClick = () => {
            if (step === 5) {
                // --- review page
                if (config.featureFlags.previewAddDataset) {
                    this.gotoStep(step + 1);
                } else {
                    this.performPublishDataset();
                }
            } else if (step === 6) {
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
            if (step === 6 && !config.featureFlags.previewAddDataset) {
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
                                <button
                                    className="au-btn next-button"
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

    async saveAndExit() {
        try {
            await this.resetError();
            this.props.history.push(`/dataset/list`);
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
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

function mapStateToProps(state, old) {
    let datasetId = old.match.params.datasetId;
    let step = parseInt(old.match.params.step);
    if (isNaN(step)) {
        step = 0;
    }

    return {
        datasetId,
        step
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
    withRouter(connect(mapStateToProps, mapDispatchToProps)(NewDataset))
);
