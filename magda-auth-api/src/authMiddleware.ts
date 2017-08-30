import { Request, Response } from "express";
import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";
import { getUser } from "./client";

export function mustBeLoggedIn(
  this: any,
  req: Request,
  res: Response,
  next: () => void
) {
  getUserIdHandling(req, res, (userId: string) => {
    this.userId = userId;
    next();
  });
}

export function mustBeAdmin(
  this: any,
  req: Request,
  res: Response,
  next: () => void
) {
  const rejectNoAuth = () => res.status(401).send("Not authorized.");

  getUserIdHandling(req, res, (userId: string) => {
    getUser(userId).then(maybeUser => {
      maybeUser.caseOf({
        just: user => {
          (req as any).user = user;
          if (user.isAdmin) {
            next();
          } else {
            rejectNoAuth();
          }
        },
        nothing: () => {
          rejectNoAuth();
        }
      });
    });
  });
}
