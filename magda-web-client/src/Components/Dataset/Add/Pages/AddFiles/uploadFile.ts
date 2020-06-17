import { config } from "config";
import baseStorageApiPath from "./baseStorageApiPath";

export default async function uploadFile(
    datasetId: string,
    file: File,
    distId: string,
    onProgressUpdate: (progress: number) => void,
    saveDatasetToStorage: () => Promise<string>
) {
    // Save first, so that the record id will be present.
    await saveDatasetToStorage();

    const formData = new FormData();
    formData.append(file.name, file);

    const fetchUrl = `${config.storageApiUrl}upload/${baseStorageApiPath(
        datasetId,
        distId
    )}?recordId=${datasetId}`;

    let uploadProgress = 0;
    const fakeProgressInterval = setInterval(() => {
        uploadProgress += (1 - uploadProgress) / 4;
        onProgressUpdate(uploadProgress);
    }, 1000);

    try {
        const res = await fetch(fetchUrl, {
            ...config.credentialsFetchOptions,
            method: "POST",
            body: formData
        });
        if (res.status !== 200) {
            throw new Error("Could not upload file");
        }
    } finally {
        uploadProgress = 1;
        onProgressUpdate(uploadProgress);
        clearInterval(fakeProgressInterval);
    }
}
