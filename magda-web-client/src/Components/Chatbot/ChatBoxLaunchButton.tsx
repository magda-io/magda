import { useState, useRef, FunctionComponent, useCallback } from "react";
import ButtonToolbar from "rsuite/ButtonToolbar";
import IconButton from "rsuite/IconButton";
import Button from "rsuite/Button";
import Modal from "rsuite/Modal";
import MagdaNamespacesConsumer from "../../Components/i18n/MagdaNamespacesConsumer";
import { BsChatRightDotsFill } from "react-icons/bs";
import { useAsync } from "react-async-hook";
import reportError from "helpers/reportError";
import Loader from "rsuite/Loader";
import isChrome from "../../libs/isChrome";
import getChromeExtensionVersion from "../../libs/getChromeExtensionVersion";
import semver from "semver";
import { config } from "../../config";
import MarkdownViewer from "../../Components/Common/MarkdownViewer";
import type ChatBoxTypeImport from "./ChatBox";
import "./ChatBoxLaunchButton.scss";

interface PropsType {
    appName: string;
}

async function createExtensionCheckingMessage(appName: string) {
    const {
        llmExtensionId,
        llmExtensionRequiredVer,
        llmExtensionInstallationUrl
    } = config;
    const extensionVersion = await getChromeExtensionVersion(llmExtensionId);
    if (extensionVersion === false) {
        return (
            "Can't find required LLM extension. \n\n" +
            `The Chatbot feature requires ${appName} Chrome extension here: <a href="${llmExtensionInstallationUrl}">${llmExtensionInstallationUrl}</a> ` +
            `to run LLM in a web browser service worker and cache model file effectively.\n\n` +
            `Please install the required extension version "${llmExtensionRequiredVer}" and try again.`
        );
    } else if (
        typeof extensionVersion === "string" &&
        !semver.satisfies(extensionVersion, llmExtensionRequiredVer)
    ) {
        return (
            `The installed ${appName} Chrome extension with version "${extensionVersion}" doesn't meet version requirement: "${llmExtensionRequiredVer}". \n\n` +
            `The Chatbot feature requires ${appName} Chrome extension here: <a href="${llmExtensionInstallationUrl}">${llmExtensionInstallationUrl}</a> ` +
            `to run LLM in a web browser service worker and cache model file effectively.\n\n` +
            `Please install the required extension version "${llmExtensionRequiredVer}" and try again.`
        );
    }
    return "";
}

const ChatBoxLaunchButton: FunctionComponent<PropsType> = (props) => {
    const { appName } = props;
    const chatBoxCompRef = useRef<typeof ChatBoxTypeImport | null>(null);
    const ChatBox = chatBoxCompRef?.current ? chatBoxCompRef.current : null;
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [dialogMsg, setDialogMsg] = useState<string>("");

    const { loading: chatBoxLoading } = useAsync(
        async (isOpen, ChatBox, appName) => {
            try {
                if (ChatBox || !isOpen) {
                    return;
                }
                setDialogMsg("");
                const dialogMsg = await createExtensionCheckingMessage(appName);
                if (dialogMsg) {
                    setIsOpen(false);
                    setDialogMsg(dialogMsg);
                    return;
                }
                const module = await import(
                    /* webpackChunkName: "magda-chatbot" */ "./ChatBox"
                );
                chatBoxCompRef.current = module.default;
            } catch (e) {
                reportError("Failed to load ChatBot component: " + e);
            }
        },
        [isOpen, ChatBox, appName]
    );

    const handleDialogClose = useCallback(() => setDialogMsg(""), [
        setDialogMsg
    ]);

    return (
        <div className="magda-chat-box-outer-container">
            <ButtonToolbar className="launch-button">
                <IconButton
                    appearance="primary"
                    icon={<BsChatRightDotsFill />}
                    onClick={() => {
                        if (!isChrome()) {
                            reportError(
                                "Sorry, chatbot feature currently only support Google Chrome web browser."
                            );
                            return;
                        }
                        setIsOpen(true);
                    }}
                >
                    <span className="heading">Chat to {props.appName}</span>
                </IconButton>
            </ButtonToolbar>
            {dialogMsg ? (
                <Modal
                    backdrop={true}
                    keyboard={false}
                    open={true}
                    onClose={handleDialogClose}
                >
                    <Modal.Header>
                        <Modal.Title>Modal Title</Modal.Title>
                    </Modal.Header>

                    <Modal.Body>
                        <MarkdownViewer markdown={dialogMsg} />
                    </Modal.Body>
                    <Modal.Footer>
                        <Button
                            onClick={handleDialogClose}
                            appearance="primary"
                        >
                            Ok
                        </Button>
                    </Modal.Footer>
                </Modal>
            ) : null}
            {ChatBox ? (
                <ChatBox
                    appName={appName}
                    isOpen={isOpen}
                    setIsOpen={setIsOpen}
                />
            ) : null}
            {!isOpen ? null : chatBoxLoading ? (
                <Loader backdrop content="loading chatbot..." vertical />
            ) : null}
        </div>
    );
};

const ChatBoxLaunchButtonWithAppName: FunctionComponent = () => (
    <MagdaNamespacesConsumer ns={["global"]}>
        {(translate) => {
            const appName = translate(["appName", ""]);
            return <ChatBoxLaunchButton appName={appName} />;
        }}
    </MagdaNamespacesConsumer>
);

export default ChatBoxLaunchButtonWithAppName;
