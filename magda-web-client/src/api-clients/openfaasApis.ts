import fetch from "isomorphic-fetch";
import { config } from "config";
import { DistributionSource } from "Components/Dataset/Add/DatasetAddCommon";
import { Record } from "api-clients/RegistryApis";
import GenericError from "helpers/GenericError";
import promiseAny from "helpers/promiseAny";

export type OpenfaasFunction = {
    name: string; // --- openfaas function name can be used as id to invoke function
    image: string;
    namespace: string;
    invocationCount: number;
    replicas: number;
    envProcess: string;
    availableReplicas: number;
    labels?: {
        [key: string]: string;
    };
    annotations: {
        [key: string]: string;
    };
};

export type UrlProcessorResult = {
    dataset: Record;
    distributions: Record[];
};

export class UrlProcessingError extends GenericError {
    unableProcessUrl?: boolean;
}

type MagdaFuncFilterType = string | ((OpenfaasFunction) => boolean) | undefined;

/**
 * Talks to openfaas gateway, get a list of deployed openfaas functions and optionaly filter by `magdaFuncType` or with a filter function.
 * Documents of openfaas gateway can be found from:
 * https://github.com/openfaas/faas/tree/master/api-docs
 *
 * @export
 * @param {MagdaFuncFilterType} [magdaFuncFilter] Optional;
 *  If not sepcified, will return all functions in system.
 *  If a string is suppied, functions with label `magdaType` equals to the supplied string will be returned.
 *  If a function is suppied, the supplied function will be used as the filter function.
 * @returns {Promise<OpenfaasFunction[]>}
 */
export async function getOpenfaasFunctions(
    magdaFuncFilter?: MagdaFuncFilterType
): Promise<OpenfaasFunction[]> {
    const res = await fetch(
        `${config.openfaasBaseUrl}/system/functions`,
        config.credentialsFetchOptions
    );
    if (!res.ok) {
        if (res.status === 401) {
            throw new GenericError(
                "You are not authorised to access the Magda serverless function gateway.",
                401
            );
        } else {
            throw new GenericError(
                "Failed to contact openfaas gateway: " + res.statusText,
                res.status
            );
        }
    }

    const data: any[] = await res.json();

    if (!data || !data.length) {
        return [];
    }

    if (typeof magdaFuncFilter === "string") {
        return data.filter(
            (item) => item?.labels?.magdaType === magdaFuncFilter
        );
    } else if (typeof magdaFuncFilter === "function") {
        return data.filter((item) => magdaFuncFilter(item));
    } else {
        return data;
    }
}

/**
 * Talks to openfaas gateway to retrieve a list of functions with `data-url-processor` labels (or `api-url-processor` if it's for processing API urls).
 * Here the `data-url-processor` label (or `api-url-processor`) is a user-defined label that we use to distinguish the purposes of function.
 * Therefore, other connectors can opt to support this feature later without any frontend changes.
 * We only need the name field of the returned data items to invoke the function later
 *
 * @export
 * @param {DistributionSource} [type] Optional; If not specified; All url processors will be returned.
 * @returns {Promise<OpenfaasFunction[]>}
 */
export async function getAllDataUrlProcessorsFromOpenfaasGateway(
    type?: DistributionSource
) {
    let magdaFuncType;

    switch (type) {
        case DistributionSource.DatasetUrl:
            magdaFuncType = "data-url-processor";
            break;
        case DistributionSource.Api:
            magdaFuncType = "api-url-processor";
            break;
    }

    return await getOpenfaasFunctions(magdaFuncType);
}

export function getDistributionSourceFromFunctionInfo(func: OpenfaasFunction) {
    switch (func?.labels?.magdaType) {
        case "data-url-processor":
            return DistributionSource.DatasetUrl;
        case "api-url-processor":
            return DistributionSource.Api;
        default:
            throw new Error("Invalid openfaas func type");
    }
}

export type OpenfaasFunctionInputType =
    | string
    | {
          [key: string]: any;
      }
    | undefined;

/**
 * Invoke an openfaas function and return the result.
 * Please note: this function will invoke openfaas function synchronously through openfaas gateway.
 *
 * @export
 * @template T Openfaas Function invocation result type
 * @param {string} funcName Openfaas Function name
 * @param {OpenfaasFunctionInputType} [funcInput] Optional Openfaas function input data.
 * @returns {Promise<T>}
 */
export async function invokeOpenfaasFunction<T = any>(
    funcName: string,
    funcInput?: OpenfaasFunctionInputType
): Promise<T> {
    const fecthReqOption: RequestInit = {
        ...config.credentialsFetchOptions,
        method: "post"
    };

    if (funcInput) {
        fecthReqOption.body =
            typeof funcInput === "string"
                ? funcInput
                : JSON.stringify(funcInput);
    }

    const res = await fetch(
        `${config.openfaasBaseUrl}/function/${funcName}`,
        fecthReqOption
    );
    if (!res.ok) {
        const e: UrlProcessingError = new UrlProcessingError(
            `Failed to request function ${funcName}` +
                res.statusText +
                "\n" +
                (await res.text()),
            res.status
        );
        e.unableProcessUrl = true;
        throw e;
    } else {
        return (await res.json()) as T;
    }
}

export async function getDataUrlProcessorResult(
    dataUrl: string,
    type?: DistributionSource
): Promise<[UrlProcessorResult, DistributionSource]> {
    const processors = await getAllDataUrlProcessorsFromOpenfaasGateway(type);
    if (!processors || !processors.length) {
        throw new Error("No url processor available.");
    }

    return (await promiseAny<[UrlProcessorResult, DistributionSource]>(
        processors.map(
            async (item): Promise<[UrlProcessorResult, DistributionSource]> => {
                const data = (await invokeOpenfaasFunction(
                    item.name,
                    dataUrl
                )) as UrlProcessorResult;

                if (
                    !data ||
                    !data.distributions ||
                    !data.distributions.length
                ) {
                    throw new Error(
                        `Process result contains less than 1 distribution`
                    );
                }

                data.distributions = data.distributions.filter(
                    (item) =>
                        item.aspects &&
                        item.aspects["dcat-distribution-strings"]
                );

                if (!data.distributions.length) {
                    throw new Error(
                        `Process result contains less than 1 distribution with valid "dcat-distribution-strings" aspect`
                    );
                }

                return [data, getDistributionSourceFromFunctionInfo(item)] as [
                    UrlProcessorResult,
                    DistributionSource
                ];
            }
        )
    ).catch((e) => {
        const error = e?.length ? e[0] : e;
        if (error) {
            // --- only deal with the first error
            if (error.unableProcessUrl === true) {
                // --- We simplify the url processing error message here
                // --- Different data sources might fail to recognise the url for different technical reasons but those info may be too technical to the user.
                throw new Error(
                    "We weren't able to extract any information from the URL"
                );
            } else {
                // --- notify the user the `post processing` error as it'd be more `relevant` message (as at least the url has been recognised now).
                // --- i.e. url is recognised and processed but meta data is not valid or insufficient (e.g. no distributions)
                throw error;
            }
        }
    })) as [UrlProcessorResult, DistributionSource];
}
