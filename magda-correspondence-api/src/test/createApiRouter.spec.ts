import {} from "mocha";
import { ApiRouterOptions } from "../createApiRouter";
import { SMTPMailer } from "../SMTPMailer";

import createApiRouter from "../createApiRouter";

import { expect } from "chai";
import * as sinon from "sinon";
import * as supertest from "supertest";
import * as express from "express";
import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";

const REGISTRY_URL: string = "https://registry.example.com";
const registry: RegistryClient = new RegistryClient({
    baseUrl: REGISTRY_URL,
    maxRetries: 0,
    secondsBetweenRetries: 0
});

const stubbedSMTPMailer: SMTPMailer = {
    checkConnectivity() {
        return null;
    },
    send(): Promise<{}> {
        return null;
    }
} as SMTPMailer;

describe("send dataset request mail", () => {
    let app: express.Express;
    let sendStub: sinon.SinonStub;
    let errorStub: sinon.SinonStub;
    const DEFAULT_RECIPIENT = "blah@example.com";

    beforeEach(() => {
        sendStub = sinon.stub(stubbedSMTPMailer, "send");

        app = express();
        app.use(require("body-parser").json());
        app.use("/", createApiRouter(resolveRouterOptions(stubbedSMTPMailer)));

        errorStub = sinon.stub(console, "error");
    });

    afterEach(() => {
        sendStub.restore();
        errorStub.restore();
    });

    describe("/public/send/dataset/request", () => {
        it("should respond with an 200 response if sendMail() was successful", () => {
            sendStub.returns(Promise.resolve());

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
                    const args = sendStub.firstCall.args[0];

                    expect(args.to).to.equal(DEFAULT_RECIPIENT);
                    expect(args.from).to.contain("Bob Cunningham");
                    expect(args.from).to.contain(DEFAULT_RECIPIENT);
                    expect(args.replyTo).to.contain(
                        "bob.cunningham@example.com"
                    );
                });
        });

        it("should respond with an 500 response if sendMail() was unsuccessful", () => {
            sendStub.returns(Promise.reject(new Error("bad")));

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
                    expect(sendStub.called).to.be.true;
                    expect(errorStub.called).to.be.true;
                });
        });

        it("should raise an error if the sender provides an invalid email", () => {
            return supertest(app)
                .post("/public/send/dataset/request")
                .set({
                    "Content-Type": "application/json"
                })
                .send({
                    senderName: "Bob Cunningham",
                    senderEmail: "<INVALID EMAIL>",
                    message: "Give me dataset"
                })
                .expect(400)
                .then(() => {
                    expect(sendStub.called).to.be.false;
                });
        });
    });

    function resolveRouterOptions(smtpMailer: SMTPMailer): ApiRouterOptions {
        return {
            jwtSecret: "squirrel",
            defaultRecipient: DEFAULT_RECIPIENT,
            smtpMailer: smtpMailer,
            registry
        };
    }
});
