import express, { Request, Response } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts";
import {
    getUserId,
    withAuthDecision,
    requireUnconditionalAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import {
    requireObjectPermission,
    requireObjectUpdatePermission
} from "../recordAuthMiddlewares";
import {
    getTableRecord,
    updateTableRecord,
    deleteTableRecord,
    createTableRecord
} from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import { sqls, SQLSyntax } from "sql-syntax";
import {
    CreateAccessGroupRequestBodyType,
    PermissionRecord
} from "magda-typescript-common/src/authorization-api/model";
import uniq from "lodash/uniq";
import isUuid from "magda-typescript-common/src/util/isUuid";
import { v4 as uuidV4 } from "uuid";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    registryClient: AuthorizedRegistryClient;
}

export default function createAccessGroupApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;
    const registryClient = options.registryClient;

    const router: express.Router = express.Router();

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
     * @apiParam (Request Body) {string | null} [ownerId] The user ID of the access group owner. If not specified, the request user (if available) will be the owner.
     * If a null value is supplied, the owner of the access group will be set to null.
     * @apiParam (Request Body) {string | null} [orgUnitId] The ID of the orgUnit that the access group belongs to. If not specified, the request user's orgUnit (if available) will be used.
     * If a null value is supplied, the orgUnit of the access group will be set to null.
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
        getUserId,
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
                            roleId: ""
                        },
                        "access-control": {
                            ownerId: agData.ownerId,
                            orgUnitId: agData.orgUnitId
                        }
                    }
                };

                try {
                    await client.query("BEGIN");

                    const resource = await database.getResourceByUri(
                        agData.resourceUri,
                        client
                    );

                    if (!resource) {
                        throw new ServerError(
                            `resource uri ${agData.resourceUri} doesn't exist`,
                            400
                        );
                    }

                    const result = await pool.query(
                        ...sqls`SELECT id
                        FROM operations 
                        WHERE uri IN (${SQLSyntax.csv(
                            ...agData.operationUris.map((item) => sqls`${item}`)
                        )}) AND resource_id = ${resource.id}`.toQuery()
                    );

                    if (result?.rows?.length !== agData.operationUris.length) {
                        throw new ServerError(
                            `Not all provided operation uris are valid and belong to the resource ${resource.uri}`,
                            400
                        );
                    }

                    const operationIds = result.rows;

                    const permissionData = {
                        name: "auto-created access group permission",
                        description:
                            "auto-created access group permission for access group " +
                            recordId,
                        resource_id: resource.id,
                        user_ownership_constraint: false,
                        org_unit_ownership_constraint: false,
                        pre_authorised_constraint: true
                    } as PermissionRecord;

                    if (userId) {
                        permissionData["create_by"] = userId;
                        permissionData["owner_id"] = userId;
                        permissionData["edit_by"] = userId;
                    }

                    const permissionRecord = await createTableRecord(
                        client,
                        "permissions",
                        permissionData as any,
                        [
                            "name",
                            "resource_id",
                            "user_ownership_constraint",
                            "org_unit_ownership_constraint",
                            "pre_authorised_constraint",
                            "description",
                            "create_by",
                            "owner_id",
                            "edit_by"
                        ]
                    );

                    const values = (operationIds as string[]).map(
                        (id) => sqls`(${permissionRecord.id},${id})`
                    );

                    await client.query(
                        ...sqls`INSERT INTO permission_operations 
                    (permission_id, operation_id) VALUES 
                    ${SQLSyntax.csv(...values)}`.toQuery()
                    );

                    const roleData = {
                        name: "auto-created access group role",
                        description:
                            "auto-created access group role for access group " +
                            recordId
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

                    agRecord.aspects["access-group-details"].permissionId =
                        permissionRecord.id;
                    agRecord.aspects["access-group-details"].roleId = role.id;

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
                    id: recordId
                });
            } catch (e) {
                respondWithError("Create Access Group", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {put} /v0/auth/accessGroups/:id Update an access group
     * @apiDescription Update a access group
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/operation/update` permission to access this API.
     *
     * @apiParam (URL Path) {string} id id of the operation record
     * @apiParamExample (Body) {json}:
     *    {
     *       "uri": "object/aspect/delete",
     *       "name": "Delete Aspect Definition",
     *       "description": "test description"
     *    }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "uri": "object/aspect/delete",
     *       "name": "Delete Aspect Definition",
     *       "description": "test description",
     *       "resource_id": "2c0981d2-71bf-4806-a590-d1c779dcad8b"
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
        "/:id",
        requireObjectUpdatePermission(
            authDecisionClient,
            database,
            "authObject/operation/update",
            (req, res) => req.params.id,
            "operation"
        ),
        async function (req, res) {
            try {
                const record = await updateTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id,
                    req.body,
                    ["uri", "name", "description"]
                );
                res.json(record);
            } catch (e) {
                respondWithError("modify `operation`", res, e);
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {delete} /v0/auth/accessGroups/:id Delete an access group
     * @apiDescription Delete an access group
     * When the operation is deleted, access will be removed from all existing permissions that are relevant to the operation.
     *
     * You need `authObject/operation/delete` permission in order to access this API.
     *
     * @apiParam (URL Path) {string} id id of the operation
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the record doesn't exist.
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
        "/:id",
        requireObjectPermission(
            authDecisionClient,
            database,
            "authObject/operation/delete",
            (req, res) => req.params.id,
            "operation"
        ),
        async function (req, res) {
            try {
                await deleteTableRecord(
                    database.getPool(),
                    "operations",
                    req.params.id
                );
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `delete \`operation\` ${req.params.id}`,
                    res,
                    e
                );
            }
        }
    );

    return router;
}
