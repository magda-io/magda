import { Response } from "express";
import getNoCacheHeaders from "./getNoCacheHeaders";

const setResponseNoCache = (res: Response) => res.set(getNoCacheHeaders());

export default setResponseNoCache;
