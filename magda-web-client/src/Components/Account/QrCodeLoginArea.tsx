import React, { useState, useEffect, FunctionComponent, useRef } from "react";
import { useAsyncCallback } from "react-async-hook";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";
import request from "helpers/request";
import {
    convertAuthPluginApiUrl,
    QrCodeImgDataResponse,
    QrCodePollResponse
} from "api-clients/AuthApis";
import { markdownToHtml } from "Components/Common/MarkdownViewer";

type PropsType = {
    authConfig: AuthPluginConfig;
};

const QrCodeLoginArea: FunctionComponent<PropsType> = (props) => {
    const { authConfig } = props;
    const {
        key,
        name,
        qrCodeAuthResultPollUrl,
        qrCodeImgDataRequestUrl,
        qrCodeExtraInfoContent,
        qrCodeExtraInfoHeading
    } = authConfig;
    const qrCodeExtraInfoContentRuntime = qrCodeExtraInfoContent
        ? qrCodeExtraInfoContent
        : `Please scan the QR code with a mobile app that is compatible with ${name} authentication.`;

    const [authReqToken, setAuthReqToken] = useState<string | null>(null);
    const [signInError, setSignInError] = useState<Error | null>(null);

    const fetchQrCodeImage = useAsyncCallback(
        async (key, qrCodeImgDataRequestUrl) => {
            if (!qrCodeImgDataRequestUrl) {
                throw new Error(
                    "Invalid auth plugin config: `qrCodeImgDataRequestUrl` cannot be empty"
                );
            }

            const data = await request<QrCodeImgDataResponse>(
                "GET",
                convertAuthPluginApiUrl(key, qrCodeImgDataRequestUrl, {
                    // disable cache
                    rnd: Math.random().toString()
                })
            );

            const qrImage = await import(
                /* webpackChunkName: "qr-image" */ "qr-image"
            );

            setAuthReqToken(data.token);
            setSignInError(null);

            return await qrImage.image(data.data, { type: "svg" });
        }
    );

    const pollAuthResult = useAsyncCallback(
        async (key, qrCodeAuthResultPollUrl) => {
            if (!authReqToken) {
                return null;
            }

            if (!qrCodeAuthResultPollUrl) {
                throw new Error(
                    "Invalid auth plugin config: `qrCodeAuthResultPollUrl` cannot be empty"
                );
            }

            const data = await request<QrCodePollResponse>(
                "GET",
                convertAuthPluginApiUrl(key, qrCodeAuthResultPollUrl, {
                    // disable cache
                    rnd: Math.random().toString(),
                    token: authReqToken
                })
            );

            if (data?.result === "success") {
                // --- time to redirect to auth plugin and let it redirect to final destination.
                window.location = convertAuthPluginApiUrl(key, "/") as any;
            } else if (data?.result === "failure") {
                setSignInError(new Error(data?.errorMessage));
            }

            return data;
        }
    );

    const pollTimer = useRef<any>();
    const clearTimer = () => {
        if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
        }
    };

    useEffect(() => {
        // --- setup poll timer
        clearTimer();

        const timer = setInterval(() => {
            if (pollAuthResult.loading) {
                return;
            }
            pollAuthResult.execute(key, qrCodeAuthResultPollUrl);
        }, 2000);

        pollTimer.current = timer;

        return clearTimer;
    }, [key, qrCodeAuthResultPollUrl]);

    useEffect(() => {
        // --- re-genrate image when auth plugin changned
        fetchQrCodeImage.execute(key, qrCodeImgDataRequestUrl);
    }, [key, qrCodeImgDataRequestUrl]);

    return (
        <div className="col-sm-6 col-md-5">
            {signInError ? (
                <div className="au-body au-page-alerts au-page-alerts--error">
                    <p>Sign In Failed: {"" + signInError} </p>
                </div>
            ) : null}

            {(() => {
                if (fetchQrCodeImage.error) {
                    return (
                        <p>
                            Failed to fetch authentication challenge:{" "}
                            {"" + fetchQrCodeImage.error}
                        </p>
                    );
                } else if (
                    fetchQrCodeImage.loading ||
                    !fetchQrCodeImage.result
                ) {
                    return (
                        <>
                            <h2>
                                {qrCodeExtraInfoHeading
                                    ? qrCodeExtraInfoHeading
                                    : "Scan the QR Code below with mobile App:"}
                            </h2>
                            <p
                                dangerouslySetInnerHTML={{
                                    __html: markdownToHtml(
                                        qrCodeExtraInfoContentRuntime
                                    )
                                }}
                            />
                            <div>Loading QR Code image...</div>
                            <div>
                                <a
                                    onClick={() =>
                                        fetchQrCodeImage.execute(
                                            key,
                                            qrCodeImgDataRequestUrl
                                        )
                                    }
                                >
                                    Refresh QR Code Image
                                </a>
                            </div>
                        </>
                    );
                } else {
                    return (
                        <>
                            <h2>
                                {qrCodeExtraInfoHeading
                                    ? qrCodeExtraInfoHeading
                                    : "Scan the QR Code below with mobile App:"}
                            </h2>
                            <p
                                dangerouslySetInnerHTML={{
                                    __html: markdownToHtml(
                                        qrCodeExtraInfoContentRuntime
                                    )
                                }}
                            />
                            <div>
                                <img
                                    width={466}
                                    height={466}
                                    src={
                                        "data:image/svg+xml;utf8," +
                                        fetchQrCodeImage.result
                                    }
                                />
                            </div>
                            <div>
                                <a
                                    onClick={() =>
                                        fetchQrCodeImage.execute(
                                            key,
                                            qrCodeImgDataRequestUrl
                                        )
                                    }
                                >
                                    Refresh QR Code Image
                                </a>
                            </div>
                        </>
                    );
                }
            })()}
        </div>
    );
};

export default QrCodeLoginArea;
