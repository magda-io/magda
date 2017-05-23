import pool from "./pool";
import * as passport from 'passport';

export interface User {
  id?: string,
  displayName: string,
  email: string,
  photoURL?: string,
  source: string
}

function createOrGet(profile: passport.Profile, source: string): Promise<User> {
  if (!profile.emails || profile.emails.length === 0) {
    throw new Error("User with no email address");
  }
  const email = profile.emails[0].value;

  return pool
    .query('SELECT id, "displayName", email, "photoURL", source FROM users WHERE "email" = $1', [email])
    .then(res => {
      if (res.rowCount === 0) {
        return create(profileToUser(profile, source));
      } else {
        if (res.rows.length > 1) {
          throw new Error("Multiple users for a single email address");
        }
        const userRow = res.rows[0];

        if (userRow.source === source) {
          return userRow;
        } else {
          // TODO: This occurs when someone signs up through one provider but tries to sign in through another with the same email.
          // We need to communicate this to the user.ÏÏ
          throw new Error("Wrong source");
        }
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
    'INSERT INTO users(id, "displayName", email, "photoURL", source) VALUES(uuid_generate_v4(), $1, $2, $3, $4) RETURNING id',
    [user.displayName, user.email, user.photoURL, user.source]
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
    source: source
  }
}

export { createOrGet, get }