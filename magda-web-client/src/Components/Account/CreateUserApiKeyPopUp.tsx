import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useState,
    useRef,
    useImperativeHandle
} from "react";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import List from "rsuite/List";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import DatePicker from "rsuite/DatePicker";
import "./CreateUserApiKeyPopUp.scss";
import { createUserApiKey } from "api-clients/AuthApis";
import { useCallback } from "react";
import moment from "moment";
import reportError from "../../helpers/reportError";

const Paragraph = Placeholder.Paragraph;

type OnCompleteHandlerType = (keyId: string, key: string) => void;
type APIKeyCreationResult = {
    id: string;
    key: string;
};

type PropsType = {};

export type RefType = {
    open: (userId: string, onComplete?: OnCompleteHandlerType) => any;
};

const CreateUserApiKeyPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [apiKeyCreationResult, setApiKeyCreationResult] = useState<
        APIKeyCreationResult
    >();
    const [expiryOption, setExpiryOption] = useState<string>("0");
    const [expiryTime, setExpiryTime] = useState<Date | null>();

    const onCompleteRef = useRef<OnCompleteHandlerType>();
    const userIdRef = useRef<string>();

    useImperativeHandle(ref, () => ({
        open: async (userId: string, onComplete?: OnCompleteHandlerType) => {
            onCompleteRef.current = onComplete;
            userIdRef.current = userId;

            setExpiryOption("0");
            setExpiryTime(null);
            setApiKeyCreationResult(undefined);
            setIsLoading(false);
            setIsOpen(true);
        }
    }));

    const creatApiKeyHandler = useCallback(async () => {
        try {
            let keyExpiryTime: Date | undefined;
            switch (expiryOption) {
                case "0":
                    keyExpiryTime = undefined;
                    break;
                case "1":
                    keyExpiryTime = moment().add(30, "days").toDate();
                    break;
                case "2":
                    keyExpiryTime = moment().add(60, "days").toDate();
                    break;
                case "3":
                    keyExpiryTime = moment().add(90, "days").toDate();
                    break;
                case "4":
                    keyExpiryTime = moment().add(180, "days").toDate();
                    break;
                case "5":
                    if (!expiryTime || !moment(expiryTime).isValid()) {
                        throw new Error(
                            "Please select a valid expiry date. Or select from preset expiry options."
                        );
                    }
                    keyExpiryTime = expiryTime as Date;
                    break;
                default:
                    throw new Error(
                        "Please select a valid preset expiry options."
                    );
            }

            setIsLoading(true);
            setApiKeyCreationResult(undefined);
            const result = await createUserApiKey(
                userIdRef.current as string,
                keyExpiryTime
            );
            setApiKeyCreationResult(result);
            setIsLoading(false);
            if (typeof onCompleteRef.current === "function") {
                onCompleteRef.current(result.id, result.key);
            }
        } catch (e) {
            setIsLoading(false);
            reportError(e);
        }
    }, [expiryOption, expiryTime]);

    return (
        <Modal
            className="create-user-api-key-popup"
            backdrop={"static"}
            keyboard={false}
            open={isOpen}
            size="md"
            overflow={true}
            onClose={() => setIsOpen(false)}
        >
            <Modal.Header>
                <Modal.Title>
                    <b>Create API Key</b>
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isLoading ? (
                    <>
                        <div>
                            <Paragraph rows={8} />
                            <Loader center content="Creating API Key..." />
                        </div>
                    </>
                ) : apiKeyCreationResult ? (
                    <>
                        <Message showIcon type="warning">
                            You will not be able to view the API key once you
                            close this dialog. Please record the API key in a
                            secure password manager or key vault for future
                            reference.
                        </Message>
                        <List bordered>
                            <List.Item>
                                API Key ID: {apiKeyCreationResult?.id}
                            </List.Item>
                            <List.Item>
                                API Key:{" "}
                                <span>{apiKeyCreationResult?.key}</span>
                            </List.Item>
                        </List>
                        <br />
                        <Message showIcon type="info">
                            You can add the following HTTP headers to your
                            requests to perform API calls on behalf of yourself:
                        </Message>
                        <List bordered>
                            <List.Item>
                                <span>X-Magda-API-Key-Id</span>:{" "}
                                <span>{apiKeyCreationResult?.id}</span>
                            </List.Item>
                            <List.Item>
                                <span>X-Magda-API-Key</span>:{" "}
                                <span>{apiKeyCreationResult?.key}</span>
                            </List.Item>
                        </List>
                        <Message showIcon type="info">
                            You can also send Magda API key & API key ID as
                            Bearer token in Authorization header to perform API
                            calls on behalf of yourself:
                        </Message>
                        <List bordered>
                            <List.Item>
                                <span>Authorization</span>:{" "}
                                <span>
                                    Bearer {apiKeyCreationResult?.id}:
                                    {apiKeyCreationResult?.key}
                                </span>
                            </List.Item>
                        </List>
                    </>
                ) : (
                    <>
                        Api Key Expiration: &nbsp;&nbsp;
                        <select
                            value={expiryOption}
                            onChange={(e) => setExpiryOption(e.target.value)}
                        >
                            <option value="0">Never Expired</option>
                            <option value="1">30 Days</option>
                            <option value="2">60 Days</option>
                            <option value="3">90 Days</option>
                            <option value="4">180 Days</option>
                            <option value="5">Custom Defined</option>
                        </select>
                        &nbsp;&nbsp;
                        {expiryOption === "5" ? (
                            <DatePicker
                                oneTap
                                value={expiryTime}
                                onChange={setExpiryTime}
                            />
                        ) : null}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                {!apiKeyCreationResult ? (
                    <>
                        <Button
                            appearance="primary"
                            onClick={creatApiKeyHandler}
                        >
                            Create
                        </Button>
                        <Button onClick={() => setIsOpen(false)}>Cancel</Button>
                    </>
                ) : (
                    <Button onClick={() => setIsOpen(false)}>OK</Button>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(CreateUserApiKeyPopUp);
