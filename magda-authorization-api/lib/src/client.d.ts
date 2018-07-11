import { User } from "./model";
import { Maybe } from "tsmonad";
export declare function getUser(userId: string): Promise<Maybe<User>>;
export declare function getUserPublic(userId: string): Promise<Maybe<User>>;
export declare function lookupUser(
    source: string,
    sourceId: string
): Promise<Maybe<User>>;
export declare function createUser(user: User): Promise<User>;
