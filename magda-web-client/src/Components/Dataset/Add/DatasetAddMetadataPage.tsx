import React from "react";
import { withRouter } from "react-router";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";

import ToolTip from "Components/Dataset/Add/ToolTip";

import {
    createRecord,
    createNewDatasetReset,
    createNewDatasetError
} from "actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import { Steps as ProgressMeterStepsConfig } from "../../Common/AddDatasetProgressMeter";

import {
    State,
    saveState,
    DistributionState,
    createDatasetFromState
} from "./DatasetAddCommon";
import DetailsAndContents from "./Pages/DetailsAndContents";
import DatasetAddPeoplePage from "./Pages/People/DatasetAddPeoplePage";
import DatasetAddEndPreviewPage from "./Pages/DatasetAddEndPreviewPage";
import DatasetAddFilesPage from "./Pages/AddFiles";
import DatasetAddAccessAndUsePage from "./Pages/DatasetAddAccessAndUsePage";
import withAddDatasetState from "./withAddDatasetState";
import { config } from "config";

import "./DatasetAddMetadataPage.scss";
import "./DatasetAddCommon.scss";

import ReviewFilesList from "./ReviewFilesList";

import ErrorMessageBox from "./ErrorMessageBox";

import helpIcon from "assets/help.svg";
import { User } from "reducers/userManagementReducer";
import * as ValidationManager from "../Add/ValidationManager";

type Props = {
    initialState: State;
    createRecord: Function;
    createNewDatasetReset: Function;
    createNewDatasetError: Function;
    isCreating: boolean;
    creationError: any;
    lastDatasetId: string;
    step: number;
    datasetId: string;
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
        config.featureFlags.previewAddDataset
            ? () => <DatasetAddEndPreviewPage />
            : this.renderSubmitPage.bind(this)
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

        const nextIsPublish = step + 1 >= this.steps.length;

        const nextButtonCaption = () => {
            if (nextIsPublish) {
                if (config.featureFlags.previewAddDataset) {
                    return "Send Us Your Thoughts";
                } else if (this.state.isPublishing) {
                    return "Publishing as draft...";
                } else {
                    return "Publish draft dataset";
                }
            } else {
                return ProgressMeterStepsConfig[step + 1].title;
            }
        };

        const nextButtonOnClick = () => {
            if (nextIsPublish) {
                if (config.featureFlags.previewAddDataset) {
                    window.location.href =
                        "mailto:magda@csiro.au?subject=Add Dataset Feedback";
                } else {
                    this.performPublishDataset();
                }
            } else {
                this.gotoStep(step + 1);
            }
        };

        return (
            <div className="dataset-add-files-root dataset-add-meta-data-pages">
                {step > 0 ? (
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
                <ErrorMessageBox />
                <br />
                {distributions.filter(
                    item => item._state !== DistributionState.Ready
                ).length ? null : (
                    <>
                        <div className="row next-save-button-row">
                            <div className="col-sm-12">
                                <button
                                    className="au-btn next-button"
                                    onClick={nextButtonOnClick}
                                >
                                    Next: {nextButtonCaption()}
                                </button>
                                <button
                                    className="au-btn au-btn--secondary save-button"
                                    onClick={this.saveAndExit.bind(this)}
                                >
                                    Save and exit
                                </button>
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
            saveState(this.state, this.props.datasetId);
            this.props.history.push(`/dataset/list`);
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
    }

    async gotoStep(step) {
        try {
            await this.resetError();
            if (ValidationManager.validateAll()) {
                saveState(this.state, this.props.datasetId);
                this.props.history.push(
                    "/dataset/add/metadata/" + this.props.datasetId + "/" + step
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

            saveState(this.state, this.props.datasetId);

            this.setState(state => ({
                ...state,
                isPublishing: true
            }));

            await createDatasetFromState(
                this.props.datasetId,
                this.state,
                this.setState.bind(this)
            );

            this.props.history.push(`/dataset/${this.props.lastDatasetId}`);
        } catch (e) {
            this.setState({
                isPublishing: false
            });
            this.props.createNewDatasetError(e);
        }
    }
}

function mapStateToProps(state, props) {
    const datasetId = props.match.params.datasetId;
    let step = parseInt(props?.match?.params?.step);
    if (isNaN(step)) {
        step = 0;
    }

    const isCreating =
        state.record.newDataset && state.record.newDataset.isCreating;
    const creationError =
        state.record.newDataset && state.record.newDataset.error;
    const lastDatasetId =
        !isCreating &&
        state.record.newDataset &&
        state.record.newDataset.dataset &&
        state.record.newDataset.dataset.id;
    return {
        datasetId,
        step,
        isCreating,
        creationError,
        lastDatasetId
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            createRecord: createRecord,
            createNewDatasetReset: createNewDatasetReset,
            createNewDatasetError: createNewDatasetError
        },
        dispatch
    );
};

export default withAddDatasetState(
    withRouter(connect(mapStateToProps, mapDispatchToProps)(NewDataset))
);
