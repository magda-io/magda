import React from "react";
import GenericError from "./GenericError";
import { config } from "config";

export type FailedFileInfoItem = {
    // --- dist Id
    id?: string;
    // --- file title / file name
    title: string;
};

export default class FileDeletionError extends GenericError {
    public failedItems: FailedFileInfoItem[] = [];

    constructor(failedItems: FailedFileInfoItem[]) {
        super("Failed to delete file from storage API", 500);
        this.failedItems = failedItems;
    }

    getErrorContent() {
        if (!this.failedItems.length) {
            return null;
        } else {
            return (
                <div>
                    <div>
                        Failed to remove the following files from Magda's
                        storage:{" "}
                    </div>
                    <ul>
                        {this.failedItems.map((item, idx) => (
                            <li key={idx}>
                                {item.title} (id: {item.id})
                            </li>
                        ))}
                    </ul>
                    <div>
                        Please contact
                        {config.defaultContactEmail
                            ? config.defaultContactEmail
                            : "Administrator"}{" "}
                        to ensure that all files are properly removed.
                    </div>
                </div>
            );
        }
    }
}
