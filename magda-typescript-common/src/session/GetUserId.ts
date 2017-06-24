import { Request, Response } from "@types/express";
import { Maybe } from "tsmonad";
const jwt = require("jsonwebtoken");

export function getUserId(req: Request): Maybe<string> {
  const jwtToken = req.header("X-Magda-Session");

  if (jwtToken) {
    try {
      const { userId } = jwt.verify(jwtToken, process.env.JWT_SECRET || process.env.npm_package_config_JWT_SECRET);
      return Maybe.just(userId);
    } catch (e) {
      return Maybe.nothing<string>();
    }
  } else {
    return Maybe.nothing<string>();
  }
}

export function getUserIdHandling(
  req: Request,
  res: Response,
  cb: (userId: string) => void
) {
  const userId = getUserId(req);

  userId.caseOf({
    just: userId => {
      cb(userId);
    },
    nothing: () => {
      res.status(401).send("Not authorized.");
    }
  });
}
