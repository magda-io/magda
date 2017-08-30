import * as passport from "passport";
import { lookupUser, createUser } from "@magda/auth-api/dist/client";
import { User, UserToken } from "@magda/auth-api/dist/model";

export default function createOrGet(
  profile: passport.Profile,
  source: string
): Promise<UserToken> {
  return lookupUser(source, profile.id).then(maybe =>
    maybe.caseOf({
      just: user => Promise.resolve(userToUserToken(user)),
      nothing: () =>
        createUser(profileToUser(profile, source)).then(userToUserToken)
    })
  );
}

function profileToUser(profile: passport.Profile, source: string): User {
  if (!profile.emails || profile.emails.length === 0) {
    throw new Error("User with no email address");
  }

  return {
    displayName: profile.displayName,
    email: profile.emails[0].value,
    photoURL:
      profile.photos && profile.photos.length > 0
        ? profile.photos[0].value
        : undefined,
    source: source,
    sourceId: profile.id,
    isAdmin: false
  };
}

function userToUserToken(user: User): UserToken {
  return {
    id: <string>user.id,
    isAdmin: <boolean>user.isAdmin
  };
}
