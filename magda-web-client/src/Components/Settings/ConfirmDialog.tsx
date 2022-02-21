import React, { SyntheticEvent } from "react";
import Button from "rsuite/Button";
import Modal from "rsuite/Modal";
import Loader from "rsuite/Loader";

type PropsType = {};
type StateType = {
    isOpen: boolean;
    confirmMsg: string;
    headingText: string;
    confirmHandler: () => void | Promise<undefined>;
    cancelHandler: () => void;
    loadingText: string;
    isLoading: boolean;
};

class ConfirmDialog extends React.Component<PropsType, StateType> {
    public static dialogRef: ConfirmDialog;

    constructor(props) {
        super(props);
        this.state = {
            ...ConfirmDialog.defaultState
        };
        ConfirmDialog.dialogRef = this;
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
    }) {
        if (!ConfirmDialog.dialogRef) {
            throw new Error("ConfirmDialog has not been rendered yet!");
        }
        if (!config?.confirmMsg) {
            throw new Error("confirmMsg cann't be empty!");
        }
        if (!config?.confirmHandler) {
            throw new Error("confirmHandler cann't be empty!");
        }

        ConfirmDialog.dialogRef.setState({
            ...ConfirmDialog.defaultState,
            ...config,
            isOpen: true
        });
    }

    static setLoading(isLoading: boolean) {
        ConfirmDialog.dialogRef.setState({
            isLoading
        });
    }

    static close() {
        ConfirmDialog.dialogRef.setState({
            ...ConfirmDialog.defaultState,
            isOpen: false
        });
    }

    render() {
        return (
            <Modal
                className="confirm-dialog"
                overflow={true}
                size="md"
                backdrop={"static"}
                keyboard={false}
                open={this.state.isOpen}
                onClose={() => this.setState({ isOpen: false })}
            >
                <Modal.Header>
                    <Modal.Title>{this.state.headingText}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <>
                        {this.state.isLoading ? (
                            <Loader
                                backdrop
                                content={this.state.loadingText}
                                vertical
                            />
                        ) : (
                            this.state.confirmMsg
                        )}
                    </>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        appearance="primary"
                        onClick={async (e: SyntheticEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.setState({ isLoading: true });
                            await this.state.confirmHandler();
                            this.setState({ isOpen: false });
                        }}
                    >
                        Confirm
                    </Button>
                    <Button
                        onClick={(e: SyntheticEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.state.cancelHandler();
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
