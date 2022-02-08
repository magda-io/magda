import { Request, Response } from "express";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import SQLSyntax, { sqls } from "sql-syntax";
import { escapeIdentifier } from "magda-typescript-common/src/SQLUtils";
import Database from "./Database";
import { requirePermission } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { snakeCase } from "lodash";

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

/**
 * middleware used to make auth decision on one object / record.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {Database} db
 * @param {string} operationUri
 * @param {string} objectId
 * @param {PossibleObjectType} objectType
 * @param {(req: Request, res: Response, next: () => void) => {}} [onRecordNotFound]
 * @param {string} [objectKind="authObject"]
 * @return {*}
 */
export function requireObjectPermission(
    authDecisionClient: AuthDecisionQueryClient,
    db: Database,
    operationUri: string,
    objectId: string,
    objectType: PossibleObjectType,
    onRecordNotFound?: (req: Request, res: Response, next: () => void) => {},
    objectKind: string = "authObject"
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const pool = db.getPool();
            const targetTableRef = getTableRefFromObjectType(objectType);
            const result = await pool.query(
                ...sqls`SELECT * FROM ${targetTableRef} WHERE id = ${objectId} LIMIT 1`.toQuery()
            );
            if (result?.rows?.length) {
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
            requirePermission(authDecisionClient, operationUri, {
                [objectKind]: {
                    [objectType]: objectData
                }
            })(req, res, next);
        } catch (e) {
            res.status(500).send(
                `An error occurred while creating record context data for auth decision: ${operationUri}`
            );
        }
    };
}

/**
 * A middleware for query whether the user has permission to object before & after modification.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {Database} db
 * @param {string} operationUri
 * @param {string} objectId
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
    objectId: string,
    objectType: PossibleObjectType,
    newObjectData: any,
    onRecordNotFound?: (req: Request, res: Response, next: () => void) => {},
    objectKind: string = "authObject"
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const pool = db.getPool();
            const targetTableRef = getTableRefFromObjectType(objectType);
            const result = await pool.query(
                ...sqls`SELECT * FROM ${targetTableRef} WHERE id = ${objectId} LIMIT 1`.toQuery()
            );
            if (result?.rows?.length) {
                if (onRecordNotFound) {
                    onRecordNotFound(req, res, next);
                } else {
                    res.status(400).send(
                        `Failed to locate object for auth context data creation: object: ${objectType}, id: ${objectId}`
                    );
                }
                return;
            }

            const originalObjectData = result.rows[0];
            const updatedObjectData = {
                ...originalObjectData,
                ...newObjectData
            };

            const inputData: any = { [objectKind]: 1 };
            inputData[objectKind] = {};
            inputData[objectKind][objectType] = result.rows[0];
            // make sure user has permission to both before & after update object data
            requirePermission(authDecisionClient, operationUri, {
                [objectKind]: {
                    [objectType]: originalObjectData
                }
            })(req, res, () => {
                requirePermission(authDecisionClient, operationUri, {
                    [objectKind]: {
                        [objectType]: updatedObjectData
                    }
                })(req, res, next);
            });
        } catch (e) {
            res.status(500).send(
                `An error occurred while creating record context data for auth decision: ${operationUri}`
            );
        }
    };
}
