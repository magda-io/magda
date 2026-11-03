import type { SelectPickerProps } from "rsuite/SelectPicker";
import type { TreeProps } from "rsuite/Tree";

/**
 * rsuite v6 no longer exposes its picker / tree item type (`ItemDataType` in v5)
 * from a public entry point. Derive it from the public component props instead,
 * so we don't depend on rsuite's internal module layout.
 */
export type ItemDataType<T = number | string> = NonNullable<
    SelectPickerProps<T>["data"]
>[number];

/**
 * The data passed to `Tree`'s `onDrop` callback, with `dragNode` & `dropNode`
 * typed as our own tree item type.
 */
export type DropData<T> = Omit<
    Parameters<NonNullable<TreeProps["onDrop"]>>[0],
    "dragNode" | "dropNode"
> & {
    dragNode: T;
    dropNode: T;
};
