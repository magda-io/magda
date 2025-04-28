import { Request, Response } from "express";
import type AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import SQLSyntax, { sqls } from "sql-syntax";
import { escapeIdentifier } from "magda-typescript-common/src/SQLUtils.js";
import Database from "./Database.js";
import { requirePermission } from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import snakeCase from "lodash/snakeCase.js";
import isUuid from "@magda/typescript-common/dist/util/isUuid.js";

type PossibleObjectType =
    | "user"
    | "role"
    | "permission"
    | "resource"
    | "operation"
    | "apiKey"
    | "credential"
    | "orgUnit";

function getTableRefFromObjectType(objectType: PossibleObjectType): SQLSyntax {
    return escapeIdentifier(snakeCase(objectType) + "s");
}

function isUuidByObjectType(objectType: PossibleObjectType): boolean {
    switch (objectType) {
        case "user":
        case "role":
        case "permission":
        case "resource":
        case "operation":
        case "apiKey":
        case "credential":
        case "orgUnit":
            return true;
        default:
            return false;
    }
}

/**
 * This middleware is created for making unconditional decision for the access to one single object.
 * Because of it, the middleware will auto-load the record data from database as part of `input` data for decision making.
 * If you need partial decision making (without prior access to storage e.g. DB) on a group of objects, you should use [withAuthDecision](magda-typescript-common/src/authorization-api/authMiddleware) middleware
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {Database} db
 * @param {string} operationUri
 * @param {(req: Request, res: Response) => string} objectIdFunc
 * @param {PossibleObjectType} objectType
 * @param {(req: Request, res: Response, next: () => void) => {}} [onRecordNotFound]
 * @param {string} [objectKind="authObject"]
 * @return {*}
 */
export function requireObjectPermission(
    authDecisionClient: AuthDecisionQueryClient,
    db: Database,
    operationUri: string,
    objectIdFunc: (req: Request, res: Response) => string,
    objectType: PossibleObjectType,
    onRecordNotFound?: (req: Request, res: Response, next: () => void) => void,
    objectKind: string = "authObject"
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const pool = db.getPool();
            const targetTableRef = getTableRefFromObjectType(objectType);
            const objectId = objectIdFunc(req, res);
            if (isUuidByObjectType(objectType) && !isUuid(objectId)) {
                res.status(400).send(`Invalid UUID id: ${objectId}`);
                return;
            }
            const result = await pool.query(
                ...sqls`SELECT * FROM ${targetTableRef} WHERE id = ${objectId} LIMIT 1`.toQuery()
            );
            if (!result?.rows?.length) {
                if (onRecordNotFound) {
                    onRecordNotFound(req, res, next);
                } else {
                    res.status(400).send(
                        `Failed to locate object for auth context data creation: object: ${objectType}, id: ${objectId}`
                    );
                }
                return;
            }
            const objectData = result.rows[0];
            requirePermission(authDecisionClient, operationUri, (req, res) => ({
                [objectKind]: {
                    [objectType]: objectData
                }
            }))(req, res, next);
        } catch (e) {
            res.status(500).send(
                `An error occurred while creating record context data for auth decision: ${operationUri}`
            );
        }
    };
}

/**
 * A middleware for query whether the user has permission to object before & after modification.
 * Similar to `requireObjectPermission`, this middleware is created for making unconditional decision for the access to one single object.
 * If you need partial decision making (without prior access to storage e.g. DB) on a group of objects, you should use [withAuthDecision](magda-typescript-common/src/authorization-api/authMiddleware) middleware
 *
 * In additional to `requireObjectPermission`, it ensures more precisely access control in "update" context.
 * i.e. it ensures that the user has access to the object before / after the modification to the object.
 * Because of it, the middleware will auto-load the record data from database as part of `input` data for decision making.
 * Depends on the object type, you might not always need this type of control.
 *
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {Database} db
 * @param {string} operationUri
 * @param {(req: Request, res: Response) => string} objectIdFunc
 * @param {PossibleObjectType} objectType
 * @param {*} newObjectData
 * @param {(req: Request, res: Response, next: () => void) => {}} [onRecordNotFound]
 * @param {string} [objectKind="authObject"]
 * @return {*}
 */
export function requireObjectUpdatePermission(
    authDecisionClient: AuthDecisionQueryClient,
    db: Database,
    operationUri: string,
    objectIdFunc: (req: Request, res: Response) => string,
    objectType: PossibleObjectType,
    newObjectDataFunc: (req: Request, res: Response) => any = (req, res) =>
        req.body,
    onRecordNotFound?: (req: Request, res: Response, next: () => void) => {},
    objectKind: string = "authObject"
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const pool = db.getPool();
            const targetTableRef = getTableRefFromObjectType(objectType);
            const objectId = objectIdFunc(req, res);
            const result = await pool.query(
                ...sqls`SELECT * FROM ${targetTableRef} WHERE id = ${objectId} LIMIT 1`.toQuery()
            );
            if (!result?.rows?.length) {
                if (onRecordNotFound) {
                    onRecordNotFound(req, res, next);
                } else {
                    res.status(400).send(
                        `Failed to locate object for auth context data creation: object: ${objectType}, id: ${objectId}`
                    );
                }
                return;
            }

            const newObjectData = newObjectDataFunc(req, res);
            const originalObjectData = result.rows[0];
            const updatedObjectData = {
                ...originalObjectData,
                ...newObjectData
            };

            const inputData: any = { [objectKind]: 1 };
            inputData[objectKind] = {};
            inputData[objectKind][objectType] = result.rows[0];
            // make sure user has permission to both before & after update object data
            requirePermission(authDecisionClient, operationUri, (req, res) => ({
                [objectKind]: {
                    [objectType]: originalObjectData
                }
            }))(req, res, () => {
                requirePermission(
                    authDecisionClient,
                    operationUri,
                    (req, res) => ({
                        [objectKind]: {
                            [objectType]: updatedObjectData
                        }
                    })
                )(req, res, next);
            });
        } catch (e) {
            res.status(500).send(
                `An error occurred while creating record context data for auth decision: ${operationUri}`
            );
        }
    };
}
