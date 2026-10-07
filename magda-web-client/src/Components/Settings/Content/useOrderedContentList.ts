import { useCallback, useMemo, useState } from "react";
import { useAsync } from "react-async-hook";
import { useDispatch } from "react-redux";
import { fetchContent } from "actions/contentActions";
import {
    ContentRecord,
    deleteContent,
    queryContent,
    writeContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import {
    computeMoveOrderUpdates,
    getNextOrder,
    sortByOrder
} from "./contentUtils";

/**
 * Load a list of JSON content items with an `order` field (e.g. header navigation items),
 * sorted by `order`, and provide move up / down & delete operations.
 */
export default function useOrderedContentList<T extends { order?: number }>(
    idPattern: string
) {
    const dispatch = useDispatch();
    const [reloadToken, setReloadToken] = useState<string>("");
    const [isUpdating, setIsUpdating] = useState<boolean>(false);

    const { result, loading, error } = useAsync(
        async (idPattern: string, reloadToken: string) => {
            try {
                const records = await queryContent<T>(idPattern);
                return sortByOrder(
                    records.filter((item) => item.type === "application/json")
                );
            } catch (e) {
                reportError(`Failed to load content items: ${e}`);
                throw e;
            }
        },
        [idPattern, reloadToken]
    );

    const records: ContentRecord<T>[] = useMemo(() => (result ? result : []), [
        result
    ]);

    const reload = useCallback(() => setReloadToken(`${Math.random()}`), []);

    // reload the list & refresh the content used by the public header / footer
    const onChanged = useCallback(() => {
        reload();
        dispatch(fetchContent(true) as any);
    }, [reload, dispatch]);

    const move = useCallback(
        async (index: number, direction: -1 | 1) => {
            const updates = computeMoveOrderUpdates(records, index, direction);
            if (!updates.length) {
                return;
            }
            setIsUpdating(true);
            try {
                for (const { id, order } of updates) {
                    const record = records.find((item) => item.id === id);
                    await writeContent(id, { ...record?.content, order });
                }
            } catch (e) {
                reportError(`Failed to update the item order: ${e}`);
            } finally {
                setIsUpdating(false);
                onChanged();
            }
        },
        [records, onChanged]
    );

    const remove = useCallback(
        async (id: string) => {
            await deleteContent(id);
            onChanged();
        },
        [onChanged]
    );

    return {
        records,
        loading: loading || isUpdating,
        error,
        reload,
        onChanged,
        move,
        remove,
        nextOrder: getNextOrder(records)
    };
}
