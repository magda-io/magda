import pool from "./pool";
import * as passport from 'passport';

export interface User {
  id?: string,
  displayName: string,
  email: string,
  photoURL?: string,
  source: string,
  sourceId: string
}

function createOrGet(profile: passport.Profile, source: string): Promise<User> {
  return pool
    .query('SELECT id, "displayName", email, "photoURL", source, "sourceId" FROM users WHERE "sourceId" = $1 AND source = $2', [profile.id, source])
    .then(res => {
      if (res.rowCount === 0) {
        return create(profileToUser(profile, source));
      } else {
        return res.rows[0];
      }
    });
};

function get(id: string) {
  return pool
    .query(
    'SELECT id, "displayName", email, "photoURL", source FROM users WHERE "id" = $1',
    [id]
    ).then(res => res.rows[0]);
}

function create(user: User) {
  return pool
    .query(
    'INSERT INTO users(id, "displayName", email, "photoURL", source, "sourceId") VALUES(uuid_generate_v4(), $1, $2, $3, $4, $5) RETURNING id',
    [user.displayName, user.email, user.photoURL, user.source, user.sourceId]
    )
    .then(result => result.rows[0]);
}

function profileToUser(profile: passport.Profile, source: string): User {
  if (!profile.emails || profile.emails.length === 0) {
    throw new Error("User with no email address");
  }

  return {
    displayName: profile.displayName,
    email: profile.emails[0].value,
    photoURL: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : undefined,
    source: source,
    sourceId: profile.id
  }
}

export { createOrGet, get }