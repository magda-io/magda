import express, { Request, Response, NextFunction } from "express";
import Database from "../Database.js";
import respondWithError from "../respondWithError.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import {
    getUserId,
    requireUnconditionalAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import {
    createTableRecord,
    getTableRecord,
    searchTableRecord
} from "magda-typescript-common/src/SQLUtils.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import {
    CreateAccessGroupRequestBodyType,
    UpdateAccessGroupRequestBodyType
} from "magda-typescript-common/src/authorization-api/model.js";
import { JsonPatch } from "magda-typescript-common/src/registry/model.js";
import isUuid from "magda-typescript-common/src/util/isUuid.js";
import { v4 as uuidV4 } from "uuid";
import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import isArray from "lodash/isArray.js";
import uniq from "lodash/uniq.js";
import isEmpty from "lodash/isEmpty.js";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    registryClient: AuthorizedRegistryClient;
}

const userKeywordSearchFields = ["displayName", "email", "source"];

export default function createAccessGroupApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;
    const registryClient = options.registryClient;

    const router: express.Router = express.Router();

    const requireAccessGroupUnconditionalPermission = (
        operationUri: string,
        notFoundHandler?: (
            req: Request,
            res: Response,
            next: NextFunction
        ) => void
    ) =>
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req, res, next) => {
                const groupId = req.params?.groupId;
                if (!groupId) {
                    throw new ServerError(
                        "access group id cannot be empty",
                        400
                    );
                }
                const fetchRecordResult = await registryClient.getRecordInFull(
                    groupId
                );
                if (fetchRecordResult instanceof Error) {
                    if (
                        fetchRecordResult instanceof ServerError &&
                        fetchRecordResult.statusCode === 404
                    ) {
                        if (typeof notFoundHandler === "function") {
                            notFoundHandler(req, res, next);
                            return null;
                        }
                    }
                    throw fetchRecordResult;
                }
                const { aspects, ...recordData } = fetchRecordResult;
                if (aspects?.length) {
                    aspects.forEach(
                        (item: any, idx: string) =>
                            ((recordData as any)[idx] = item)
                    );
                }
                res.locals.originalAccessGroup = fetchRecordResult;
                return {
                    operationUri,
                    input: {
                        [operationUri.startsWith("object/record/")
                            ? "record"
                            : "accessGroup"]: {
                            recordData
                        }
                    }
                };
            }
        );

    async function validateAccessGroupCreationData(
        req: Request,
        res: Response
    ) {
        let {
            name,
            description,
            resourceUri,
            keywords,
            operationUris,
            ownerId,
            orgUnitId
        } = req.body as CreateAccessGroupRequestBodyType;

        if (!name) {
            throw new ServerError("`name` field cannot be empty", 400);
        }
        if (!resourceUri) {
            throw new ServerError("`resourceUri` field cannot be empty", 400);
        }
        if (resourceUri !== "object/record") {
            throw new ServerError(
                `Invalid value ${resourceUri} supplied for field \`${resourceUri}\``,
                400
            );
        }

        keywords = uniq(!keywords?.length ? [] : keywords).filter(
            (item) => !!item
        );
        const invalidKeyword = keywords.find(
            (item) => typeof item !== "string"
        );
        if (typeof invalidKeyword !== "undefined") {
            throw new ServerError(
                `One of keyword items is an invalid non-string value: ${invalidKeyword}`,
                400
            );
        }

        description = description ? "" + description : "";

        operationUris = uniq(
            !operationUris?.length ? [] : operationUris
        ).filter((item) => !!item);
        const invalidOperationUri = operationUris.find(
            (item) =>
                typeof item !== "string" || !item.startsWith("object/record/")
        );
        if (typeof invalidOperationUri !== "undefined") {
            throw new ServerError(
                `One of operationUris supplied is invalid: ${invalidOperationUri}`,
                400
            );
        }

        if (ownerId && !isUuid(ownerId)) {
            throw new ServerError(
                `Supplied ownerId is not valid UUID: ${ownerId}`,
                400
            );
        }

        if (orgUnitId && !isUuid(orgUnitId)) {
            throw new ServerError(
                `Supplied orgUnitId is not valid UUID: ${orgUnitId}`,
                400
            );
        }

        if (!ownerId && ownerId !== null && res.locals.userId) {
            // needs to pre-fill ownerId with request user's id
            ownerId = res.locals.userId;
        }

        if (!orgUnitId && orgUnitId !== null && res.locals.userId) {
            // needs to pre-fill orgUnitId with request user's orgUnitId
            const user = await database.getUser(res.locals.userId);
            orgUnitId = user
                .map((item) => (item.orgUnitId ? item.orgUnitId : null))
                .valueOr<string | null>(null);
        }

        ownerId = ownerId ? ownerId : null;
        orgUnitId = orgUnitId ? orgUnitId : null;

        return {
            name,
            description,
            resourceUri,
            keywords,
            operationUris,
            ownerId,
            orgUnitId
        };
    }

    /**
     * @apiGroup Auth Access Groups
     * @api {post} /v0/auth/accessGroups Create a new access group
     * @apiDescription Create a new access group.
     * Returns the newly created access group.
     * Required `object/accessGroup/create` permission to access this API.
     *
     * @apiParam (Request Body) {string} name A name given to the access group
     * @apiParam (Request Body) {string} [description] The free text description for the access group
     * @apiParam (Request Body) {string[]} [keywords] Tags (or keywords) help users discover the access-group
     * @apiParam (Request Body) {string} resourceUri The Resource URI specifies the type of resources that the access group manages.
     * At this moment, only one value `object/record` (registry records) is supported.
     * @apiParam (Request Body) {string} operationUris A list of operations that the access group allows enrolled users to perform on included resources.
     * @apiParam (Request Body) {string} [ownerId] The user ID of the access group owner. If not specified, the request user (if available) will be the owner.
     * If a `null` value is supplied, the owner of the access group will be set to `null`.
     * @apiParam (Request Body) {string} [orgUnitId] The ID of the orgUnit that the access group belongs to. If not specified, the request user's orgUnit (if available) will be used.
     * If a `null` value is supplied, the orgUnit of the access group will be set to `null`.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test access group",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "keywords": ["keyword 1", "keyword2"],
     *       "operationUris": ["object/record/read", "object/record/update"],
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": "36ef9450-6579-421c-a178-d3b5b4f1a3df"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test access group",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "operationUris": ["object/record/read", "object/record/update"],
     *       "keywords": ["keyword 1", "keyword2"],
     *       "permissionId": "2b117a5f-dadb-4130-bf44-b72ee67d009b",
     *       "roleId": "5b616fa0-a123-4e9c-b197-65b3db8522fa",
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": "36ef9450-6579-421c-a178-d3b5b4f1a3df",
     *       "createBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z",
     *       "editBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z"
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/",
        requireUnconditionalAuthDecision(authDecisionClient, (req, res) => ({
            operationUri: "object/accessGroup/create",
            input: {
                object: {
                    accessGroup: req.body
                }
            }
        })),
        getUserId(options.jwtSecret),
        async (req: Request, res: Response) => {
            try {
                const agData = await validateAccessGroupCreationData(req, res);
                const recordId = uuidV4();
                const userId = res.locals.userId;
                const timestamp = new Date().toISOString();
                const pool = database.getPool();
                const client = await pool.connect();
                const agRecord = {
                    id: recordId,
                    name: agData.name,
                    aspects: {
                        "access-group-details": {
                            name: agData.name,
                            resourceUri: agData.resourceUri,
                            description: agData.description,
                            keywords: agData.keywords,
                            operationUris: agData.operationUris,
                            createTime: timestamp,
                            createBy: userId,
                            editTime: timestamp,
                            editBy: userId,
                            permissionId: "",
                            roleId: "",
                            extraControlPermissionIds: [] as string[]
                        },
                        "access-control": {
                            ownerId: agData.ownerId,
                            orgUnitId: agData.orgUnitId,
                            preAuthorisedPermissionIds: [] as string[]
                        }
                    }
                };

                try {
                    await client.query("BEGIN");

                    // this permission determined the access that all group users have to all datasets in the group
                    // this permission is a `preAuthorised` permission and will be added to `access-control` aspect, `preAuthorisedPermissionIds` field of all datasets in the group
                    // see https://github.com/magda-io/magda/issues/3269
                    const permissionRecord = await database.createPermission(
                        {
                            name: "System managed for access group",
                            description: `Auto-created access group item permission for access group ${recordId}.`,
                            resourceUri: agData.resourceUri,
                            operationUris: agData.operationUris,
                            userOwnershipConstraint: false,
                            orgUnitOwnershipConstraint: false,
                            preAuthorisedConstraint: true,
                            createBy: userId ? userId : null,
                            ownerId: userId ? userId : null
                        },
                        client
                    );

                    // this permission allow the user (who're in the group) to be able to read the access group information
                    // this permission is a `preAuthorised` permission.
                    // And it will be added to `access-control` aspect, `preAuthorisedPermissionIds` field of the access group that is to be created
                    // see https://github.com/magda-io/magda/issues/3402
                    const accessGroupRecordPermissionRecord = await database.createPermission(
                        {
                            name: "System managed for access group",
                            description: `Auto-created access group record permission for access group ${recordId}.`,
                            resourceUri: "object/record",
                            operationUris: ["object/record/read"],
                            userOwnershipConstraint: false,
                            orgUnitOwnershipConstraint: false,
                            preAuthorisedConstraint: true,
                            createBy: userId ? userId : null,
                            ownerId: userId ? userId : null
                        },
                        client
                    );

                    // this permission currently only used by UI as a short-cut to determine which user has access to access group UI
                    // Actually access group access is controlled by uri `object/record` see:
                    // - https://github.com/magda-io/magda/issues/3402
                    // - https://github.com/magda-io/magda/issues/3269
                    const accessGroupPermissionRecord = await database.createPermission(
                        {
                            name: "System managed for access group",
                            description: `Auto-created access group UI permission for access group ${recordId}.`,
                            resourceUri: "object/accessGroup",
                            operationUris: ["object/accessGroup/read"],
                            userOwnershipConstraint: false,
                            orgUnitOwnershipConstraint: false,
                            preAuthorisedConstraint: false,
                            createBy: userId ? userId : null,
                            ownerId: userId ? userId : null
                        },
                        client
                    );

                    const roleData = {
                        name: "auto-created for access group",
                        description: "auto-created for access group " + recordId
                    } as any;

                    if (userId) {
                        roleData["create_by"] = userId;
                        roleData["owner_id"] = userId;
                        roleData["edit_by"] = userId;
                    }

                    const role = await createTableRecord(
                        client,
                        "roles",
                        roleData,
                        [
                            "name",
                            "description",
                            "create_by",
                            "owner_id",
                            "edit_by"
                        ]
                    );

                    // add 3 permissions to the role
                    await client.query(
                        ...sqls`INSERT INTO role_permissions (role_id, permission_id)
                        VALUES 
                        (${role.id}, ${permissionRecord.id}),
                        (${role.id}, ${accessGroupRecordPermissionRecord.id}),
                        (${role.id}, ${accessGroupPermissionRecord.id})`.toQuery()
                    );

                    agRecord.aspects["access-group-details"].permissionId =
                        permissionRecord.id;
                    agRecord.aspects["access-group-details"].roleId = role.id;
                    agRecord.aspects[
                        "access-group-details"
                    ].extraControlPermissionIds = [
                        accessGroupRecordPermissionRecord.id,
                        accessGroupPermissionRecord.id
                    ];

                    // make sure group users have read access to access group information
                    // `accessGroupRecordPermissionRecord` is a preAuthorised permission tha requires explicit grant.
                    agRecord.aspects[
                        "access-control"
                    ].preAuthorisedPermissionIds.push(
                        accessGroupRecordPermissionRecord.id
                    );

                    const recordCreationResult = await registryClient.creatRecord(
                        agRecord as any
                    );
                    if (recordCreationResult instanceof Error) {
                        throw recordCreationResult;
                    }
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
                res.json({
                    ...agRecord.aspects["access-group-details"],
                    id: recordId,
                    ownerId: agData.ownerId,
                    orgUnitId: agData.orgUnitId
                });
            } catch (e) {
                respondWithError("Create Access Group", res, e);
            }
        }
    );

    async function updateAccessGroupRecord(
        groupId: string,
        accessGroupDetailsAspectData: any,
        accessControlAspectData: any,
        retrieveRecord: boolean = true
    ) {
        if (
            isEmpty(accessGroupDetailsAspectData) &&
            isEmpty(accessControlAspectData)
        ) {
            throw new ServerError(
                "There is acceptable non-empty data fields supplied for update",
                400
            );
        }
        if (!isEmpty(accessGroupDetailsAspectData)) {
            const resultOrError = await registryClient.putRecordAspect(
                groupId,
                "access-group-details",
                accessGroupDetailsAspectData,
                true
            );
            if (resultOrError instanceof Error) {
                throw resultOrError;
            }
        }

        if (
            accessGroupDetailsAspectData?.keywords ||
            accessGroupDetailsAspectData?.operationUris
        ) {
            const patches: JsonPatch[] = [];
            if (accessGroupDetailsAspectData?.keywords) {
                patches.push({
                    op: "replace",
                    path: "/keywords",
                    value: accessGroupDetailsAspectData.keywords
                });
            }
            if (accessGroupDetailsAspectData?.operationUris) {
                patches.push({
                    op: "replace",
                    path: "/operationUris",
                    value: accessGroupDetailsAspectData.operationUris
                });
            }
            const resultOrError = await registryClient.patchRecordAspect(
                groupId,
                "access-group-details",
                patches
            );
            if (resultOrError instanceof Error) {
                throw resultOrError;
            }
        }

        if (!isEmpty(accessControlAspectData)) {
            const resultOrError = await registryClient.putRecordAspect(
                groupId,
                "access-control",
                accessControlAspectData,
                true
            );
            if (resultOrError instanceof Error) {
                throw resultOrError;
            }
        }

        if (!retrieveRecord) {
            return;
        }

        const recordOrError = await registryClient.getRecord(
            groupId,
            ["access-group-details"],
            ["access-control"],
            false
        );
        if (recordOrError instanceof Error) {
            throw recordOrError;
        }

        return {
            ...(recordOrError?.aspects?.["access-group-details"]
                ? recordOrError.aspects["access-group-details"]
                : {}),
            ownerId: recordOrError?.aspects?.["access-control"]?.ownerId
                ? recordOrError.aspects["access-control"].ownerId
                : null,
            orgUnitId: recordOrError?.aspects?.["access-control"]?.orgUnitId
                ? recordOrError.aspects["access-control"].orgUnitId
                : null,
            id: groupId
        };
    }

    /**
     * @apiGroup Auth Access Groups
     * @api {put} /v0/auth/accessGroups/:groupId Update an access group
     * @apiDescription Update an access group
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/operation/update` permission to access this API.
     * Please note: you can't update the `resourceUri` field of an access group.
     * If you have to change the resource type, you should delete the access group and create a new one.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (Request Body) {string} [name] the name given to the access group
     * @apiParam (Request Body) {string} [description] The free text description for the access group
     * @apiParam (Request Body) {string[]} [keywords] Tags (or keywords) help users discover the access-group
     * @apiParam (Request Body) {string} [operationUris] A list of operations that the access group allows enrolled users to perform on included resources.
     * @apiParam (Request Body) {string} [ownerId] The user ID of the access group owner. If not specified, the request user (if available) will be the owner.
     * If a `null` value is supplied, the owner of the access group will be set to `null`.
     * @apiParam (Request Body) {string} [orgUnitId] The ID of the orgUnit that the access group belongs to. If not specified, the request user's orgUnit (if available) will be used.
     * If a `null` value is supplied, the orgUnit of the access group will be set to `null`.
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test access group 2",
     *       "description": "a test access group",
     *       "keywords": ["keyword 1", "keyword2"],
     *       "operationUris": ["object/record/read"],
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": null
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test access group 2",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "operationUris": ["object/record/read"],
     *       "keywords": ["keyword 1", "keyword2"],
     *       "permissionId": "2b117a5f-dadb-4130-bf44-b72ee67d009b",
     *       "roleId": "5b616fa0-a123-4e9c-b197-65b3db8522fa",
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": null,
     *       "createBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z",
     *       "editBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z"
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put(
        "/:groupId",
        requireAccessGroupUnconditionalPermission("object/record/update"),
        getUserId(options.jwtSecret),
        async function (req: Request, res: Response) {
            try {
                const groupId = `${req.params.groupId}`.trim();
                const userId = res.locals.userId;
                const permissionId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.permissionId;
                if (!permissionId) {
                    throw new ServerError(
                        "The current access group record has invalid empty permissionId.",
                        500
                    );
                }

                const data = req.body as UpdateAccessGroupRequestBodyType;

                const accessGroupDetailsAspectData: any = {};
                const accessControlAspectData: any = {};

                if (typeof data?.name !== "undefined") {
                    accessGroupDetailsAspectData["name"] = data.name;
                }

                if (typeof data?.description !== "undefined") {
                    accessGroupDetailsAspectData["description"] =
                        data.description;
                }

                if (typeof data?.keywords !== "undefined") {
                    if (!isArray(data.keywords)) {
                        throw new ServerError(
                            "`keywords` field should be an array.",
                            400
                        );
                    }
                    const keywords = data.keywords.filter(
                        (item) => typeof item === "string"
                    );
                    if (keywords.length !== data.keywords.length) {
                        throw new ServerError(
                            "All items in `keywords` field should be strings.",
                            400
                        );
                    }
                    accessGroupDetailsAspectData["keywords"] = uniq(keywords);
                }

                if (typeof data?.ownerId !== "undefined") {
                    if (!isUuid(data.ownerId) && data.ownerId !== null) {
                        throw new ServerError(
                            "`ownerId` field needs to be either an UUID or null.",
                            400
                        );
                    }
                    accessControlAspectData["ownerId"] = data.ownerId;
                }
                if (typeof data?.orgUnitId !== "undefined") {
                    if (!isUuid(data.orgUnitId) && data.orgUnitId !== null) {
                        throw new ServerError(
                            "`ownerId` field needs to be either an UUID or null.",
                            400
                        );
                    }
                    accessControlAspectData["orgUnitId"] = data.orgUnitId;
                }

                if (typeof data?.operationUris === "undefined") {
                    if (
                        !isEmpty(accessGroupDetailsAspectData) ||
                        !isEmpty(accessControlAspectData)
                    ) {
                        accessGroupDetailsAspectData["editBy"] = userId;
                        accessGroupDetailsAspectData[
                            "editTime"
                        ] = new Date().toISOString();
                    }
                    // no need to update permission operations as it's not supplied
                    res.json(
                        await updateAccessGroupRecord(
                            groupId,
                            accessGroupDetailsAspectData,
                            accessControlAspectData
                        )
                    );
                    return;
                } else {
                    let operationUris = data?.operationUris?.length
                        ? [...data.operationUris]
                        : [];
                    if (!operationUris.length) {
                        throw new ServerError(
                            "Supplied `operationUris` is empty",
                            400
                        );
                    }
                    operationUris = operationUris
                        .filter((item) => !!item)
                        .map((item) => `${item}`.trim().toLowerCase())
                        .filter((item) => !!item);
                    if (!operationUris.length) {
                        throw new ServerError(
                            "Supplied `operationUris` contains invalid items",
                            400
                        );
                    }
                    operationUris = uniq(operationUris);
                    accessGroupDetailsAspectData[
                        "operationUris"
                    ] = operationUris;
                }

                const pool = database.getPool();
                const client = await pool.connect();

                try {
                    await client.query("BEGIN");

                    await database.updatePermission(
                        permissionId,
                        {
                            operationUris: data.operationUris,
                            ownerId: data?.ownerId ? data.ownerId : null,
                            editBy: userId ? userId : null
                        },
                        client
                    );

                    accessGroupDetailsAspectData["editBy"] = userId;
                    accessGroupDetailsAspectData[
                        "editTime"
                    ] = new Date().toISOString();

                    res.json(
                        await updateAccessGroupRecord(
                            groupId,
                            accessGroupDetailsAspectData,
                            accessControlAspectData
                        )
                    );
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
            } catch (e) {
                respondWithError(
                    `Update Access Group: ${req?.params?.id}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {delete} /v0/auth/accessGroups/:groupId Delete an access group
     * @apiDescription Delete an access group
     * You can only delete an access group when all resources (e.g. datasets) that are associated with the access group are removed from the access group.
     * Once an access group is deleted, the role & permission that are associated with the access group will be also deleted.
     *
     * You need `object/record/delete` permission to the access group record in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the access group doesn't exist.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:groupId",
        requireAccessGroupUnconditionalPermission(
            "object/record/delete",
            (req, res, next: Function) => {
                // reach here indicates the access group record doesn't exist
                // we will response 200 with {result: false}
                res.json({ result: false });
                return null; // return null to skip rest of request processing
            }
        ),
        async function (req, res) {
            try {
                const groupId = `${req.params.groupId}`.trim();
                // use previously fetched record by `requireAccessGroupAccess`
                const accessGroupRecord = res.locals
                    .originalAccessGroup as Record;
                const permissionId =
                    accessGroupRecord?.aspects?.["access-group-details"]?.[
                        "permissionId"
                    ];
                const roleId =
                    accessGroupRecord?.aspects?.["access-group-details"]?.[
                        "roleId"
                    ];

                const extraControlPermissionIds = accessGroupRecord?.aspects?.[
                    "access-group-details"
                ]?.["extraControlPermissionIds"].filter((pid: string) =>
                    isUuid(pid)
                );

                if (!isUuid(permissionId)) {
                    throw new ServerError(
                        "The access group permission id is not a valid UUID",
                        500
                    );
                }
                if (!isUuid(roleId)) {
                    throw new ServerError(
                        "The access group role id is not a valid UUID",
                        500
                    );
                }
                const searchRecordResult = await registryClient.getRecords(
                    [],
                    [],
                    undefined,
                    undefined,
                    1,
                    [
                        `access-control.preAuthorisedPermissionIds:<|${encodeURIComponent(
                            permissionId
                        )}`
                    ]
                );
                if (searchRecordResult instanceof Error) {
                    throw searchRecordResult;
                }
                if (searchRecordResult?.records?.length) {
                    throw new ServerError(
                        "You need to remove all records from the access group before you can delete the access group",
                        400
                    );
                }

                const pool = database.getPool();
                const client = await pool.connect();

                try {
                    await client.query("BEGIN");

                    // remove the access group role from all users
                    await client.query(
                        ...sqls`DELETE FROM user_roles WHERE role_id=${roleId}`.toQuery()
                    );

                    await database.deleteRole(roleId, client);

                    // delete possible other permissions that are controlled by access group
                    // `extraControlPermissionIds` is a new field since v2.1.0. Thus, we need to consider the situation where it's empty.
                    const permissionIds = [
                        permissionId,
                        ...(extraControlPermissionIds?.length
                            ? extraControlPermissionIds
                            : [])
                    ];

                    await client.query(
                        ...sqls`DELETE FROM role_permissions WHERE ${sqls`permission_id`.in(
                            permissionIds
                        )}`.toQuery()
                    );
                    await client.query(
                        ...sqls`DELETE FROM permission_operations WHERE ${sqls`permission_id`.in(
                            permissionIds
                        )}`.toQuery()
                    );
                    await client.query(
                        ...sqls`DELETE FROM permissions WHERE ${sqls`id`.in(
                            permissionIds
                        )}`.toQuery()
                    );

                    const deleteResult = await registryClient.deleteRecord(
                        groupId
                    );
                    if (deleteResult instanceof Error) {
                        throw deleteResult;
                    }
                    await client.query("COMMIT");
                    res.json({
                        result: deleteResult?.deleted === true ? true : false
                    });
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
            } catch (e) {
                respondWithError(
                    `delete \`access group\` ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {post} /v0/auth/accessGroups/:groupId/datasets/:datasetId Add an Dataset to an Access Group
     * @apiDescription Add an Dataset to an Access Group
     *
     * Access group users will all granted access (specified by the access group permission) to all added datasets.
     *
     * You need `object/record/update` permission to both access group and dataset record in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (URL Path) {string} datasetId id of the dataset
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the action is actually performed or the dataset had already been added to the access group.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:groupId/datasets/:datasetId",
        getUserId(options.jwtSecret),
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req, res, next) => {
                const datasetId = req.params?.datasetId;
                if (!datasetId) {
                    throw new ServerError("datasetId cannot be empty", 400);
                }
                const fetchRecordResult = await registryClient.getRecordInFull(
                    datasetId
                );
                if (fetchRecordResult instanceof Error) {
                    throw fetchRecordResult;
                }
                const { aspects, ...recordData } = fetchRecordResult;
                if (aspects?.length) {
                    aspects.forEach(
                        (item: any, idx: string) =>
                            ((recordData as any)[idx] = item)
                    );
                }
                res.locals.originalDataset = fetchRecordResult;
                return {
                    operationUri: "object/record/update",
                    input: {
                        object: {
                            recordData
                        }
                    }
                };
            }
        ),
        requireAccessGroupUnconditionalPermission("object/record/update"),
        async function (req, res) {
            try {
                const recordIds = [] as string[];
                if (res?.locals?.originalDataset?.id) {
                    recordIds.push(res.locals.originalDataset.id as string);
                }

                const distributionIds =
                    res?.locals?.originalDataset?.aspects?.[
                        "dataset-distributions"
                    ]?.["distributions"];

                if (distributionIds?.length) {
                    recordIds.splice(0, 0, ...distributionIds);
                }

                const permissionId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["permissionId"];

                if (!isUuid(permissionId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid permissionId.`,
                        500
                    );
                }

                const result = await registryClient.putRecordsAspect(
                    recordIds,
                    "access-control",
                    {
                        preAuthorisedPermissionIds: [permissionId]
                    },
                    // merge data. will not produce duplicates array items
                    true
                );

                if (result instanceof Error) {
                    throw result;
                }

                await updateAccessGroupRecord(
                    req.params.groupId,
                    {
                        editBy: res.locals.userId,
                        editTime: new Date().toISOString()
                    },
                    undefined,
                    false
                );

                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `Add an Dataset "${req?.params?.datasetId}" to an Access Group ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {delete} /v0/auth/accessGroups/:groupId/datasets/:datasetId Remove an Dataset from an Access Group
     * @apiDescription Remove an Dataset from an Access Group
     *
     * Access group users will lost the access (granted by the access group) to the removed dataset.
     *
     * You need `object/record/update` permission to the access group.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (URL Path) {string} datasetId id of the dataset
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the action is actually performed or the dataset had already been removed from the access group.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:groupId/datasets/:datasetId",
        getUserId(options.jwtSecret),
        requireAccessGroupUnconditionalPermission("object/record/update"),
        async function (req, res) {
            try {
                const datasetId = req.params?.datasetId;
                if (!datasetId) {
                    throw new ServerError("datasetId cannot be empty", 400);
                }
                const permissionId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["permissionId"];

                if (!isUuid(permissionId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid permissionId.`,
                        500
                    );
                }

                const datasetFetchResult = await registryClient.getRecord(
                    datasetId,
                    [],
                    ["dataset-distributions"],
                    false
                );

                if (datasetFetchResult instanceof Error) {
                    throw datasetFetchResult;
                }

                const distributionIds =
                    datasetFetchResult?.aspects?.["dataset-distributions"]?.[
                        "dataset-distributions"
                    ];

                const recordIds: string[] = [
                    datasetId,
                    ...(distributionIds?.length
                        ? distributionIds.filter(
                              (item: any) =>
                                  typeof item === "string" && item.trim()
                          )
                        : [])
                ];

                const result = await registryClient.deleteRecordsAspectArrayItems(
                    recordIds,
                    "access-control",
                    "$.preAuthorisedPermissionIds",
                    [permissionId]
                );

                if (result instanceof Error) {
                    throw result;
                }
                await updateAccessGroupRecord(
                    req.params.groupId,
                    {
                        editBy: res.locals.userId,
                        editTime: new Date().toISOString()
                    },
                    undefined,
                    false
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `Remove a Dataset "${req?.params?.datasetId}" from an Access Group ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {post} /v0/auth/accessGroups/:groupId/users/:userId Add an User to an Access Group
     * @apiDescription Add an User to an Access Group
     *
     * Access group users have access (specified by the access group permission) to all datasets in the access group.
     *
     * You need `object/record/update` permission to the access group record in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (URL Path) {string} userId id of the user to be added to the access group
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the action is actually performed or the user had already been added to the access group.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:groupId/users/:userId",
        getUserId(options.jwtSecret),
        requireAccessGroupUnconditionalPermission("object/record/update"),
        async function (req, res) {
            try {
                const userId = req.params?.userId;
                if (!isUuid(userId)) {
                    throw new ServerError(`userId is not valid`, 400);
                }

                const roleId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["roleId"];

                if (!isUuid(roleId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid roleId.`,
                        500
                    );
                }

                const pool = database.getPool();

                const role = getTableRecord(pool, "roles", roleId);
                if (!role) {
                    throw new ServerError(
                        "Cannot locate access group role with id: " + roleId,
                        500
                    );
                }

                const user = getTableRecord(pool, "users", userId);
                if (!user) {
                    throw new ServerError(
                        "Cannot locate user with id: " + userId,
                        400
                    );
                }

                const client = await pool.connect();
                try {
                    await client.query("BEGIN");

                    const result = await client.query(
                        ...sqls`SELECT 1 FROM user_roles WHERE user_id=${userId} AND role_id=${roleId}`.toQuery()
                    );
                    if (result?.rows?.length) {
                        res.json({ result: false });
                        await client.query("COMMIT");
                        return;
                    }

                    await client.query(
                        ...sqls`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${roleId})`.toQuery()
                    );
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
                await updateAccessGroupRecord(
                    req.params.groupId,
                    {
                        editBy: res.locals.userId,
                        editTime: new Date().toISOString()
                    },
                    undefined,
                    false
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `Add an user "${req?.params?.userId}" to an Access Group ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {delete} /v0/auth/accessGroups/:groupId/users/:userId Remove an User from an Access Group
     * @apiDescription Remove an User from an Access Group
     *
     * You need `object/record/update` permission to the access group record in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (URL Path) {string} userId id of the user to be added to the access group
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the action is actually performed or the user had already been added to the access group.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:groupId/users/:userId",
        getUserId(options.jwtSecret),
        requireAccessGroupUnconditionalPermission("object/record/update"),
        async function (req, res) {
            try {
                const userId = req.params?.userId;
                if (!isUuid(userId)) {
                    throw new ServerError(`userId is not valid`, 400);
                }

                const roleId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["roleId"];

                if (!isUuid(roleId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid roleId.`,
                        500
                    );
                }

                const pool = database.getPool();

                const role = getTableRecord(pool, "roles", roleId);
                if (!role) {
                    throw new ServerError(
                        "Cannot locate access group role with id: " + roleId,
                        500
                    );
                }

                const user = getTableRecord(pool, "users", userId);
                if (!user) {
                    throw new ServerError(
                        "Cannot locate user with id: " + userId,
                        400
                    );
                }

                const result = await pool.query(
                    ...sqls`DELETE FROM user_roles WHERE user_id=${userId} AND role_id=${roleId} RETURNING id`.toQuery()
                );

                await updateAccessGroupRecord(
                    req.params.groupId,
                    {
                        editBy: res.locals.userId,
                        editTime: new Date().toISOString()
                    },
                    undefined,
                    false
                );

                if (result?.rows?.length) {
                    res.json({ result: true });
                } else {
                    res.json({ result: false });
                }
            } catch (e) {
                respondWithError(
                    `Remove the user "${req?.params?.userId}" from the Access Group ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    function createFetchUsersHandler(returnCount: boolean, apiName: string) {
        return async function fetchUsers(req: Request, res: Response) {
            try {
                const roleId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["roleId"];

                if (!isUuid(roleId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid roleId.`,
                        500
                    );
                }
                const conditions: SQLSyntax[] = [
                    sqls`(EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = users.id and ur.role_id = ${roleId}))`
                ];
                if (req.query?.keyword) {
                    const keyword = "%" + req.query?.keyword + "%";
                    conditions.push(
                        SQLSyntax.joinWithOr(
                            userKeywordSearchFields.map(
                                (field) =>
                                    sqls`${escapeIdentifier(
                                        "users." + field
                                    )} ILIKE ${keyword}`
                            )
                        ).roundBracket()
                    );
                }

                if (req.query?.id) {
                    conditions.push(sqls`users.id = ${req.query.id}`);
                }
                if (req.query?.source) {
                    conditions.push(sqls`users.source = ${req.query.source}`);
                }
                if (req.query?.orgUnitId) {
                    conditions.push(
                        sqls`users."orgUnitId" = ${req.query.orgUnitId}`
                    );
                }
                if (req.query?.sourceId) {
                    conditions.push(
                        sqls`users."sourceId" = ${req.query.sourceId}`
                    );
                }

                const records = await searchTableRecord(
                    database.getPool(),
                    "users",
                    conditions,
                    {
                        selectedFields: returnCount
                            ? [sqls`COUNT(users.*) as count`]
                            : [sqls`users.*`],
                        offset: returnCount
                            ? undefined
                            : (req?.query?.offset as string),
                        limit: returnCount
                            ? undefined
                            : (req?.query?.limit as string),
                        orderBy: returnCount
                            ? undefined
                            : sqls`users."displayName" ASC`
                    }
                );
                if (returnCount) {
                    // response will be {count: number}
                    res.json(records[0]);
                } else {
                    res.json(records);
                }
            } catch (e) {
                respondWithError(apiName, res, e);
            }
        };
    }

    /**
     * @apiGroup Auth Access Groups
     * @api {get} /v0/auth/accessGroups/:groupId/users Get all matched users in an access group
     * @apiDescription return a list matched users of an access group.
     * Required `object/record/read` permission to the access group in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (Query String) {number} [offset] The index of the first record in the result set to retrieve.
     * @apiParam (Query String) {number} [limit] The maximum number of records of the result set to receive. If not present, a default value of 500 will be used.
     * @apiParam (Query String) {string} [keyword] When set, will only return user records whose "displayName", "email" or "source" field contains the specified keyword.
     * @apiParam (Query String) {string} [id] When set, will only return records whose id is the specified ID.
     * @apiParam (Query String) {string} [source] When set, will only return records whose source is the specified source name.
     * @apiParam (Query String) {string} [sourceId] When set, will only return records whose sourceId is the specified source ID.
     * @apiParam (Query String) {string} [orgUnitId] When set, will only return records whose orgUnitId is the specified org unit id.
     *
     * @apiSuccessExample {json} 200
     *    [{
     *        "id":"...",
     *        "displayName":"Fred Nerk",
     *        "email":"fred.nerk@data61.csiro.au",
     *        "photoURL":"...",
     *        "source":"google",
     *        "orgUnitId": "..."
     *    }]
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/:groupId/users",
        requireAccessGroupUnconditionalPermission("object/record/read"),
        createFetchUsersHandler(false, "Get users in an access group")
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {get} /v0/auth/accessGroups/:groupId/users/count Get the count of all matched users in an access group
     * @apiDescription return the count number of all matched users of an access group.
     * Required `object/record/read` permission to the access group in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (Query String) {string} [keyword] When set, will only return user records whose "displayName", "email" or "source" field contains the specified keyword.
     * @apiParam (Query String) {string} [id] When set, will only return records whose id is the specified ID.
     * @apiParam (Query String) {string} [source] When set, will only return records whose source is the specified source name.
     * @apiParam (Query String) {string} [sourceId] When set, will only return records whose sourceId is the specified source ID.
     * @apiParam (Query String) {string} [orgUnitId] When set, will only return records whose orgUnitId is the specified org unit id.
     *
     * @apiSuccessExample {json} 200
     *    {
     *      "count" : 5
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.get(
        "/:groupId/users/count",
        requireAccessGroupUnconditionalPermission("object/record/read"),
        createFetchUsersHandler(true, "Get user count in an access group")
    );

    return router;
}
