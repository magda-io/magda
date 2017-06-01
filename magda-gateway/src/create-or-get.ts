import * as passport from 'passport';
import { lookupUser, createUser } from '@magda/auth-api/lib/src/client';
import { User } from '@magda/auth-api/lib/src/model';

export default function createOrGet(profile: passport.Profile, source: string): Promise<String> {
    const user = profileToUser(profile, source);

    return lookupUser(user.source, user.sourceId).then(maybe => maybe.caseOf({
        just: user => Promise.resolve(<string>user.id),
        nothing: () => createUser(user).then(user => <string>user.id)
    }));
};

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