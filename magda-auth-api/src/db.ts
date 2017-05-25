import pool from "./pool";
import { User } from './model';
import { Maybe } from 'tsmonad';

function getUser(id: string): Promise<Maybe<User>> {
  return pool
    .query(
    'SELECT id, "displayName", email, "photoURL", source FROM users WHERE "id" = $1',
    [id]
    ).then(res => rowsToMaybe(res.rows));
}

function getUserByExternalDetails(source: string, sourceId: string): Promise<Maybe<User>> {
  return pool
    .query('SELECT id, "displayName", email, "photoURL", source, "sourceId" FROM users WHERE "sourceId" = $1 AND source = $2', [sourceId, source])
    .then(res => rowsToMaybe(res.rows));
}

function createUser(user: User): Promise<User> {
  return pool
    .query(
    'INSERT INTO users(id, "displayName", email, "photoURL", source, "sourceId") VALUES(uuid_generate_v4(), $1, $2, $3, $4, $5) RETURNING id',
    [user.displayName, user.email, user.photoURL, user.source, user.sourceId]
    )
    .then(result => result.rows[0]);
}

function rowsToMaybe(rows: User[]): Maybe<User> {
  return rows.length > 0 ? Maybe.just(rows[0]) : Maybe.nothing<User>();
}

export { getUserByExternalDetails, getUser, createUser }