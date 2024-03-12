import { Request, Response } from "express";
import ServerError from "./ServerError.js";

export default function handleServerError(req: Request, res: Response, e: any) {
    if (e instanceof ServerError) {
        res.status(e.statusCode).send(e.message);
    } else {
        res.status(500).send("" + e);
    }
    console.log(`Error on request to ${req.originalUrl}: ${e}`);
}
