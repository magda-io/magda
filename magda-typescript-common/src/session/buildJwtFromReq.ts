import buildJwt from "./buildJwt.js";

const buildJwtFromReq = (req: any, jwtSecret: string) =>
    buildJwt(jwtSecret, req?.user?.id, { session: req?.user?.session });

export default buildJwtFromReq;
