import {} from "mocha";
import * as sinon from "sinon";
import * as chai from "chai";
import { ApiRouterOptions } from "../createApiRouter";

import createApiRouter from "../createApiRouter";

import * as supertest from "supertest";
import * as express from "express";
import { SMTPMailer, Message } from "../SMTPMailer";

const registryUrl: string = "https://registry.example.com";

describe("send dataset request mail", () => {
    it("should respond with an 200 response if sendMail() was successful", () => {
        const stubbedSMTPMailer: SMTPMailer = {
            send(): Promise<{}> {
                return null;
            }
        } as SMTPMailer;

        sinon.stub(stubbedSMTPMailer, "send");

        (stubbedSMTPMailer.send as sinon.SinonStub).callsFake(
            (message: Message) => {
                chai.expect(message.to).to.equal("data@digital.gov.au");
                chai
                    .expect(message.from)
                    .to.equal("bob.cunningham@example.com");
                return Promise.resolve();
            }
        );

        let app: express.Express = express();
        app.use(require("body-parser").json());
        app.use("/", createApiRouter(resolveRouterOptions(stubbedSMTPMailer)));

        return supertest(app)
            .post("/public/send/dataset/request")
            .set({
                "Content-Type": "application/json"
            })
            .send({
                senderName: "Bob Cunningham",
                senderEmail: "bob.cunningham@example.com",
                message: "Give me dataset"
            })
            .expect(200)
            .then(() => {
                chai.expect((stubbedSMTPMailer.send as sinon.SinonStub).called)
                    .to.be.true;
            });
    });

    it("should respond with an 500 response if sendMail() was unsuccessful", () => {
        const stubbedSMTPMailer: SMTPMailer = {
            send(): Promise<{}> {
                return null;
            }
        } as SMTPMailer;

        sinon.stub(stubbedSMTPMailer, "send");

        (stubbedSMTPMailer.send as sinon.SinonStub).callsFake(
            (message: Message) => {
                chai.expect(message.to).to.equal("data@digital.gov.au");
                chai
                    .expect(message.from)
                    .to.equal("bob.cunningham@example.com");
                return Promise.reject(new Error());
            }
        );

        let app: express.Express = express();
        app.use(require("body-parser").json());
        app.use("/", createApiRouter(resolveRouterOptions(stubbedSMTPMailer)));

        return supertest(app)
            .post("/public/send/dataset/request")
            .set({
                "Content-Type": "application/json"
            })
            .send({
                senderName: "Bob Cunningham",
                senderEmail: "bob.cunningham@example.com",
                message: "Give me dataset"
            })
            .expect(500)
            .then(() => {
                chai.expect((stubbedSMTPMailer.send as sinon.SinonStub).called)
                    .to.be.true;
            });
    });
});

function resolveRouterOptions(smtpMailer: SMTPMailer): ApiRouterOptions {
    return {
        jwtSecret: "squirrel",
        registryUrl: registryUrl,
        smtpMailer: smtpMailer
    };
}
