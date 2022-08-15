import { updateUser, UserRecord, queryUsers } from "api-clients/AuthApis";
import React, {
    useRef,
    useImperativeHandle,
    forwardRef,
    useState,
    ForwardRefRenderFunction,
    useCallback
} from "react";
import { useAsyncCallback, useAsync } from "react-async-hook";
import Form from "rsuite/Form";
import Schema from "rsuite/Schema";
import Button from "rsuite/Button";
import Modal from "rsuite/Modal";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import "./UserFormPopUp.scss";
import reportError from "../../helpers/reportError";
import isEmpty from "lodash/isEmpty";

type PropsType = {};

type UpdateCompleteHandlerType = (submittedUserId: string) => void;

export type RefType = {
    open: (userId: string, onComplete?: UpdateCompleteHandlerType) => void;
    close: () => void;
};

const UserFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [userId, setUserId] = useState<string>();
    const [user, setUser] = useState<UserRecord>();
    const [formError, setFormError] = useState({});
    // we might want to force reload the user on open in avoid obsolete data.
    const [dataReloadToken, setDataReloadToken] = useState<string>("");

    const onCompleteRef = useRef<UpdateCompleteHandlerType>();

    const model = Schema.Model({
        displayName: Schema.Types.StringType().isRequired(
            "This field is required."
        ),
        email: Schema.Types.StringType()
            .isEmail("Please enter a valid email address.")
            .isRequired("This field is required."),
        photoURL: Schema.Types.StringType().isURL(
            "This field must be a valid URL."
        ),
        source: Schema.Types.StringType(),
        sourceId: Schema.Types.StringType()
    });

    // use useCallback to make handler ref stable
    // not a logic-wise must-have but will be performance-wise better
    const onModalClose = useCallback(() => {
        setUserId(undefined);
        setIsOpen(false);
    }, []);

    useImperativeHandle(ref, () => ({
        open: (userId: string, onComplete?: UpdateCompleteHandlerType) => {
            onCompleteRef.current = onComplete;
            userId = userId?.trim();
            setUserId(userId);
            setDataReloadToken(`${Math.random()}`);
            setIsOpen(true);
        },
        close: onModalClose
    }));

    // load user data to prefill the form by id
    const { loading: loadingUser, error: loadingUserError } = useAsync(
        async (userId?: string, dataReloadToken?: string) => {
            if (!userId) {
                setUser(undefined);
            } else {
                const users = await queryUsers({ id: userId, noCache: true });
                if (users?.length) {
                    setUser(users[0]);
                } else {
                    setUser(undefined);
                }
            }
        },
        [userId, dataReloadToken]
    );

    const submitData = useAsyncCallback(async () => {
        try {
            const { id, orgUnitId, ...userData } = user as UserRecord;
            await updateUser(userId as string, userData);
            setIsOpen(false);
            if (typeof onCompleteRef.current === "function") {
                // call the callback to notify the popup opener
                onCompleteRef.current(userId as string);
            }
        } catch (e) {
            reportError(`Failed to update user: ${e}`, {
                header: "Error:"
            });
            throw e;
        }
    });

    return (
        <Modal
            className="update-user-form"
            backdrop="static"
            keyboard={false}
            open={isOpen}
            onClose={onModalClose}
        >
            <Modal.Header>
                <Modal.Title>Update User</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {loadingUser ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : loadingUserError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the user record:{" "}
                        {`${loadingUserError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={`Updating user data...`}
                                vertical
                            />
                        ) : (
                            <>
                                <Form
                                    model={model}
                                    className="user-popup-form"
                                    fluid
                                    onChange={setUser as any}
                                    onCheck={setFormError}
                                    formValue={user}
                                >
                                    <Form.ErrorMessage />

                                    <Form.Group controlId="ctrl-displayname">
                                        <Form.ControlLabel>
                                            Display Name
                                        </Form.ControlLabel>
                                        <Form.Control name="displayName" />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-email">
                                        <Form.ControlLabel>
                                            Email:
                                        </Form.ControlLabel>
                                        <Form.Control
                                            name="email"
                                            type="email"
                                        />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-photo-url">
                                        <Form.ControlLabel>
                                            Photo Url
                                        </Form.ControlLabel>
                                        <Form.Control name="photoURL" />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-source">
                                        <Form.ControlLabel>
                                            Source
                                        </Form.ControlLabel>
                                        <Form.Control name="source" />
                                    </Form.Group>

                                    <Form.Group controlId="ctrl-source-id">
                                        <Form.ControlLabel>
                                            Source Id
                                        </Form.ControlLabel>
                                        <Form.Control name="sourceId" />
                                    </Form.Group>
                                </Form>
                                <div>
                                    <label>
                                        Please contact system admin to make sure
                                        you understand the technical implication
                                        of source &amp; source Id field before
                                        attempt to update the values of the two
                                        fields.
                                    </label>
                                </div>
                            </>
                        )}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    onClick={submitData.execute}
                    appearance="primary"
                    disabled={
                        submitData.loading ||
                        loadingUser ||
                        !userId ||
                        !isEmpty(formError)
                    }
                >
                    Save
                </Button>
                <Button onClick={onModalClose} disabled={submitData.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(UserFormPopUp);
