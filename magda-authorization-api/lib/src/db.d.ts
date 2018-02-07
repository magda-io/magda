import { User } from "./model";
import { Maybe } from "tsmonad";
declare function getUser(id: string): Promise<Maybe<User>>;
declare function getUserByExternalDetails(
    source: string,
    sourceId: string
): Promise<Maybe<User>>;
declare function createUser(user: User): Promise<User>;
export { getUserByExternalDetails, getUser, createUser };
