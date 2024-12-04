import { History, Location } from "history";
import { v4 as uuidv4 } from "uuid";
import {
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate
} from "@langchain/core/prompts";
import {
    RunnableSequence,
    Runnable,
    RunnableLambda,
    RunnableConfig
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChainInput, getLocationType } from "../commons";
import {
    EVENT_TYPE_PARTIAL_MSG,
    EVENT_TYPE_PARTIAL_MSG_FINISH,
    createChatEventMessage
} from "../Messaging";
import { WebLLMTool } from "../ChatWebLLM";

const systemPromptTpl = SystemMessagePromptTemplate.fromTemplate(
    `You are a friendly AI agent named "{appName}". \n` +
        `You should greet the user and offer system usage information based on the user message and the available functions below: \n ` +
        `{toolList}`
);

function createToolList(location: Location): string {
    const type = getLocationType(location);
    switch (type) {
        case "DATASET_PAGE":
            return (
                "- Search dataset tool: search and return relevant datasets based on the user inquiry.\n" +
                "- Tabular data analysis tool: When one of tabular data file of the current dataset is relevant to the user inquiry. " +
                "This tool will be used to answer the user inquiry with tabular data analysis result."
            );
        case "DISTRIBUTION_PAGE":
            return (
                "- Search dataset tool: search and return relevant datasets based on the user inquiry.\n" +
                "- Tabular data analysis tool: When one of tabular data file of the current dataset distribution is relevant to the user inquiry. " +
                "This tool will be used to answer the user inquiry with tabular data analysis result."
            );
        default:
            return "- Search dataset tool: search and return relevant datasets based on the user inquiry.";
    }
}

const defaultAgent: WebLLMTool = {
    name: "defaultAgent",
    func: async function () {
        const context = (this as unknown) as ChainInput;
        const { model, queue, location } = context;
        const prompt = ChatPromptTemplate.fromMessages([
            systemPromptTpl,
            HumanMessagePromptTemplate.fromTemplate("{question}")
        ]);
        const defaultAgentChain = prompt
            .pipe(model)
            .pipe(new StringOutputParser());

        const stream = await defaultAgentChain.stream({
            ...context,
            toolList: createToolList(location)
        });
        const msgId = uuidv4();
        let partialMsgSent = false;
        for await (const chunk of stream) {
            queue.push(
                createChatEventMessage(EVENT_TYPE_PARTIAL_MSG, {
                    id: msgId,
                    msg: chunk
                })
            );
            partialMsgSent = true;
        }
        if (partialMsgSent) {
            queue.push(
                createChatEventMessage(EVENT_TYPE_PARTIAL_MSG_FINISH, {
                    id: msgId
                })
            );
        }
    },
    description:
        "This tool can greet the user and offer system usage information base on the user message."
};

export default defaultAgent;
