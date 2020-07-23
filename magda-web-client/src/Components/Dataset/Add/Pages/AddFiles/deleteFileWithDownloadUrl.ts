import deleteFile from "./deleteFile";
import getDistInfoFromDownloadUrl from "./getDistInfoFromDownloadUrl";
import { Distribution } from "../../DatasetAddCommon";

type ReturnValue = {
    fileName: string;
};

export default async function deleteFileWithDownloadUrl(
    url: string
): Promise<ReturnValue> {
    const { fileName } = getDistInfoFromDownloadUrl(url);

    await deleteFile({
        title: fileName,
        downloadURL: url
    } as Distribution);

    return {
        fileName
    };
}
