import fetch from "isomorphic-fetch";
import shortId from "shortid";
import { v4 as uuidv4 } from "uuid";

type CkanFuncTypes =
    | "site_read"
    | "package_list"
    | "current_package_list_with_resources"
    | "revision_list"
    | "package_revision_list"
    | "member_list"
    | "group_list"
    | "organization_list"
    | "group_list_authz"
    | "organization_list_for_user"
    | "group_revision_list"
    | "organization_revision_list"
    | "license_list"
    | "tag_list"
    | "user_list"
    | "package_relationships_list"
    | "package_show"
    | "resource_show"
    | "resource_view_show"
    | "resource_view_list"
    | "resource_status_show"
    | "revision_show"
    | "group_show"
    | "organization_show"
    | "group_package_show"
    | "tag_show"
    | "user_show"
    | "package_autocomplete"
    | "format_autocomplete"
    | "user_autocomplete"
    | "organization_autocomplete"
    | "package_search"
    | "resource_search"
    | "tag_search"
    | "tag_autocomplete"
    | "task_status_show"
    | "term_translation_show"
    | "get_site_user"
    | "status_show"
    | "vocabulary_list"
    | "vocabulary_show"
    | "user_activity_list"
    | "package_activity_list"
    | "group_activity_list"
    | "organization_activity_list"
    | "recently_changed_packages_activity_list"
    | "activity_detail_list"
    | "user_activity_list_html"
    | "package_activity_list_html"
    | "group_activity_list_html"
    | "organization_activity_list_html"
    | "recently_changed_packages_activity_list_html"
    | "user_follower_count"
    | "dataset_follower_count"
    | "group_follower_count"
    | "organization_follower_count"
    | "user_follower_list"
    | "dataset_follower_list"
    | "group_follower_list"
    | "organization_follower_list"
    | "am_following_user"
    | "am_following_dataset"
    | "am_following_group"
    | "followee_count"
    | "user_followee_count"
    | "dataset_followee_count"
    | "group_followee_count"
    | "followee_list"
    | "user_followee_list"
    | "dataset_followee_list"
    | "group_followee_list"
    | "organization_followee_list"
    | "dashboard_activity_list"
    | "dashboard_activity_list_html"
    | "dashboard_new_activities_count"
    | "member_roles_list"
    | "help_show"
    | "config_option_show"
    | "config_option_list"
    | "job_list"
    | "job_show"
    | "package_create"
    | "resource_create"
    | "resource_view_create"
    | "resource_create_default_resource_views"
    | "package_create_default_resource_views"
    | "package_relationship_create"
    | "member_create"
    | "group_create"
    | "organization_create"
    | "rating_create"
    | "user_create"
    | "user_invite"
    | "vocabulary_create"
    | "activity_create"
    | "tag_create"
    | "follow_user"
    | "follow_dataset"
    | "group_member_create"
    | "organization_member_create"
    | "follow_group"
    | "resource_update"
    | "resource_view_update"
    | "resource_view_reorder"
    | "package_update"
    | "package_resource_reorder"
    | "package_relationship_update"
    | "group_update"
    | "organization_update"
    | "user_update"
    | "user_generate_apikey"
    | "task_status_update"
    | "task_status_update_many"
    | "term_translation_update"
    | "term_translation_update_many"
    | "vocabulary_update"
    | "dashboard_mark_activities_old"
    | "send_email_notifications"
    | "package_owner_org_update"
    | "bulk_update_private"
    | "bulk_update_public"
    | "bulk_update_delete"
    | "config_option_update"
    | "package_patch"
    | "resource_patch"
    | "group_patch"
    | "organization_patch"
    | "user_delete"
    | "package_delete"
    | "dataset_purge"
    | "resource_delete"
    | "resource_view_delete"
    | "resource_view_clear"
    | "package_relationship_delete"
    | "member_delete"
    | "group_delete"
    | "organization_delete"
    | "group_purge"
    | "organization_purge"
    | "task_status_delete"
    | "vocabulary_delete"
    | "tag_delete"
    | "unfollow_user"
    | "unfollow_dataset"
    | "group_member_delete"
    | "organization_member_delete"
    | "unfollow_group"
    | "job_clear"
    | "job_cancel";

export class CkanError extends Error {
    public statusCode?: number;
}

async function getCkanResData<T = any>(res: Response): Promise<T> {
    if (res.status !== 200) {
        const error = new CkanError(
            `Status Code: ${res.status} ${
                res.statusText
            } \n ${await res.text()}`
        );
        error.statusCode = res.status;
        throw error;
    }
    const resData = await res.json();
    if (!resData.success) {
        const error = new CkanError(
            `Error "${
                resData.error.message
            }" happened when requested ckan function "${resData.help}"`
        );
        if (resData.error && resData.error.__type === "Not Found Error") {
            error.statusCode = 404;
        }
        throw error;
    }
    return resData.result;
}

class CkanClient {
    private apiKey: string = "";
    private serverUrl: string = "";

    constructor(serverUrl: string, apiKey: string = "") {
        if (!serverUrl) {
            throw new Error(`serverUrl cannot be empty!`);
        }
        this.serverUrl = serverUrl;
        if (apiKey) {
            this.apiKey = apiKey;
        }
    }

    async callCkanFunc<T = any>(
        funcName: CkanFuncTypes,
        params?: {
            [key: string]: any;
        }
    ) {
        const options: RequestInit = {
            method: "POST"
        };
        if (this.apiKey) {
            options.headers = {
                Authorization: this.apiKey
            };
        }
        if (params) {
            options.body = JSON.stringify(params);
            options.headers = {
                ...(options.headers ? options.headers : {}),
                "Content-Type": "application/json"
            };
        }

        const res = await fetch(
            `${this.serverUrl}/api/3/action/${funcName}`,
            options
        );

        return await getCkanResData<T>(res);
    }

    async packageNameOrIdExist(nameOrId: string): Promise<boolean> {
        try {
            await this.callCkanFunc("package_show", {
                id: nameOrId
            });

            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Generate Ckan name from title
     *
     * @param {string} title
     * @returns {Promise<string>}
     * @memberof CkanClient
     */
    async getAvailablePackageName(title: string): Promise<string> {
        if (!title.trim().length) {
            throw new Error("title cannot be empty string.");
        }

        let name = title
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[^a-z0-9-]/gi, "-")
            .replace(/-+/g, "-")
            .substr(0, 100);
        if (name.length < 2) {
            name = name + "--";
        }

        if (!(await this.packageNameOrIdExist(name))) {
            return name;
        }

        const randomStr = shortId().toLowerCase();

        name = name.substr(0, 100 - randomStr.length - 1) + "-" + randomStr;

        if (!(await this.packageNameOrIdExist(name))) {
            return name;
        }

        return uuidv4();
    }

    async getPackage(idOrName: string): Promise<{ [key: string]: any } | null> {
        try {
            const data = await this.callCkanFunc("package_show", {
                id: idOrName
            });
            return data;
        } catch (e) {
            if (e.statusCode === 404) {
                return null;
            }
            throw e;
        }
    }

    async createDataset() {
        const title = "test push dataset";
        let result = await this.callCkanFunc("package_create", {
            name: await this.getAvailablePackageName(title),
            title: "test push dataset"
        });
        return result;
    }
}

export default CkanClient;
