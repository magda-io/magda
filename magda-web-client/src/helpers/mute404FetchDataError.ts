import ServerError from "@magda/typescript-common/dist/ServerError";

export default async function mute404FetchDataError<T>(
    fetchDataFunc: () => Promise<T>
) {
    try {
        return await fetchDataFunc();
    } catch (e) {
        if (e instanceof ServerError && e.statusCode === 404) {
            return undefined;
        }
        throw e;
    }
}
