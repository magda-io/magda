import { Request, Response } from 'express';
import { URL } from 'url'

export function redirectOnSuccess(toURL: string, req: Request, res: Response) {
    const source = new URL(toURL);
    source.searchParams.set('result', 'success');
    source.searchParams.set('expires', (<Date>(<any>req).session.cookie._expires).toISOString());
    source.searchParams.delete('reason');
    res.redirect(<string>source.href);
}

export function redirectOnError(err: any, toURL: string, req: Request, res: Response) {
    const source = new URL(toURL);
    source.searchParams.set('result', 'failure');
    source.searchParams.set('reason', err);
    source.searchParams.delete('expires');
    res.redirect(<string>source.href);
}