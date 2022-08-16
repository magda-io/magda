import React, { SyntheticEvent } from "react";
import Button from "rsuite/Button";
import Modal from "rsuite/Modal";
import Loader from "rsuite/Loader";
import reportError from "helpers/reportError";
import { v4 as uuid } from "uuid";

type PropsType = {};
type StateType = {
    isOpen: boolean;
    confirmMsg: string;
    headingText: string;
    confirmHandler: () => void | Promise<void>;
    cancelHandler: () => void | Promise<void>;
    loadingText: string;
    isLoading: boolean;
    errorNotificationDuration?: number;
};

class ConfirmDialog extends React.Component<PropsType, StateType> {
    public static dialogRef: ConfirmDialog | undefined;
    public static dialogRefList: { [key: string]: ConfirmDialog } = {};

    public id: string = uuid();

    constructor(props) {
        super(props);
        this.state = {
            ...ConfirmDialog.defaultState
        };
    }

    static getAvailableDialogRef(): ConfirmDialog | undefined {
        const refs = Object.values(ConfirmDialog.dialogRefList).filter(
            (item) => !!item
        );
        if (!refs?.length) {
            return undefined;
        }
        return refs[0];
    }

    static defaultState: StateType = {
        isOpen: false,
        confirmMsg: "",
        headingText: "Confirm?",
        confirmHandler: () => undefined,
        cancelHandler: () => undefined,
        loadingText: "Please wait...",
        isLoading: false
    };

    static open(config: {
        confirmMsg: string;
        headingText?: string;
        confirmHandler: () => void;
        cancelHandler?: () => void;
        loadingText?: string;
        isLoading?: boolean;
        errorNotificationDuration?: number;
    }) {
        if (!ConfirmDialog.dialogRef) {
            throw new Error("ConfirmDialog has not been rendered yet!");
        }
        if (!config?.confirmMsg) {
            throw new Error("confirmMsg can't be empty!");
        }
        if (!config?.confirmHandler) {
            throw new Error("confirmHandler can't be empty!");
        }

        ConfirmDialog.dialogRef.setState({
            ...ConfirmDialog.defaultState,
            ...config,
            isOpen: true
        });
    }

    static setLoading(isLoading: boolean) {
        ConfirmDialog.dialogRef?.setState({
            isLoading
        });
    }

    static close() {
        ConfirmDialog.dialogRef?.setState({
            ...ConfirmDialog.defaultState,
            isOpen: false
        });
    }

    componentDidMount() {
        if (!ConfirmDialog.dialogRef) {
            ConfirmDialog.dialogRef = this;
        }
        ConfirmDialog.dialogRefList[this.id] = this;
    }

    componentWillUnmount() {
        delete ConfirmDialog.dialogRefList[this.id];
        if (ConfirmDialog.dialogRef === this) {
            ConfirmDialog.dialogRef = ConfirmDialog.getAvailableDialogRef();
        }
    }

    render() {
        return (
            <Modal
                className="confirm-dialog"
                aria-labelledby="modal-title"
                aria-describedby="modal-description"
                role="alertdialog"
                overflow={true}
                size="md"
                backdrop={"static"}
                keyboard={false}
                open={this.state.isOpen}
                onClose={() => this.setState({ isOpen: false })}
            >
                <Modal.Header>
                    <Modal.Title id={`modal-title-${this.id}`}>
                        {this.state.headingText}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body
                    id={`modal-description-${this.id}`}
                    style={{ minHeight: "80px" }}
                >
                    <div>
                        {this.state.isLoading ? (
                            <Loader
                                backdrop
                                content={this.state.loadingText}
                                vertical
                            />
                        ) : (
                            this.state.confirmMsg
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        onClick={async (ev: SyntheticEvent) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            try {
                                this.setState({ isLoading: true });
                                await this.state.confirmHandler();
                                this.setState({ isOpen: false });
                            } catch (ex) {
                                this.setState({ isLoading: false });
                                reportError(ex, {
                                    duration:
                                        typeof this.state
                                            .errorNotificationDuration ===
                                        "undefined"
                                            ? undefined
                                            : this.state
                                                  .errorNotificationDuration
                                });
                            }
                        }}
                    >
                        Confirm
                    </Button>
                    <Button
                        onClick={async (ev: SyntheticEvent) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            await this.state.cancelHandler();
                            this.setState({ isOpen: false });
                        }}
                    >
                        Cancel
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }
}

export default ConfirmDialog;
