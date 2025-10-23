import OpenAI from "openai";
import fs from "fs";
import { getNodesAndRelationshipsFromResult } from "@/app/_utils/kg/get-nodes-and-relationships-from-result";
import type {
  Extractor,
  ExtractorOptions,
  NodesAndRelationships,
  TransformerSchema,
} from "./base";

const generateSystemMessageWithSchema = (schema: string) => {
  return `
Provide a set of Nodes in the form [ENTITY, TYPE, PROPERTIES] and a set of relationships in the form [ENTITY1, RELATIONSHIP, ENTITY2, PROPERTIES]. 
Pay attention to the type of the properties, if you can't find data for a property set it to null. Don't make anything up and don't add any extra data. If you can't find any data for a node or relationship don't add it.
Only add nodes and relationships that are part of the schema. If you don't get any relationships in the schema only add nodes.
Do not include extra text in your response, but return only the data.

# Response format
Schema: Nodes: [Person {age: integer, name: string}] Relationships: [Person, roommate, Person]
Alice is 25 years old and Bob is her roommate.
Nodes: [["Alice", "Person", {"age": 25, "name": "Alice"}], ["Bob", "Person", {"name": "Bob"}]]
Relationships: [["Alice", "roommate", "Bob"]]

#Schema
${schema}`;
};

const generateSystemMessage = () => {
  return `
Provide a set of Nodes in the form [ENTITY_ID, TYPE, PROPERTIES] and a set of Relationships in the form [ENTITY_ID_1, RELATIONSHIP, ENTITY_ID_2, PROPERTIES] from attached data.
Attempt to extract as many Nodes and Relationships as you can.
It is important that the ENTITY_ID_1 and ENTITY_ID_2 exists as Nodes with a matching ENTITY_ID.
If you can't pair a Relationship with a pair of Nodes don't add it.
Don't make anything up and don't add any extra data.
When you find a Node or Relationship you want to add try to create a generic TYPE for it that  describes the entity you can also think of it as a label.
Nodes that are targets of Edges must also be defined as a Node.
Do not include extra text in your response, but return only the data.

# Response format
Data: Alice lawyer and is 25 years old and Bob is her roommate since 2001. Bob works as a journalist. Alice owns a the webpage www.alice.com and Bob owns the webpage www.bob.com.
Nodes: ["alice", "Person", {"age": 25, "occupation": "lawyer", "name":"Alice"}], ["bob", "Person", {"occupation": "journalist", "name": "Bob"}], ["alice.com", "Webpage", {"url": "www.alice.com"}], ["bob.com", "Webpage", {"url": "www.bob.com"}]
Relationships: ["alice", "roommate", "bob", {"start": 2021}], ["alice", "owns", "alice.com", {}], ["bob", "owns", "bob.com", {}]
    `;
};
// 型が合わなくなったので、一旦使わない
export class AssistantsApiExtractor implements Extractor {
  async extract(
    options: ExtractorOptions,
  ): Promise<NodesAndRelationships | null> {
    const { localFilePath, isPlaneTextMode, schema, additionalPrompt } =
      options;
    const openai = new OpenAI();
    const assistant = await openai.beta.assistants.create({
      name: "Graph Database Assistant",
      instructions:
        "You are a top-tier algorithm designed for extracting information in structured formats to build a knowledge graph. Your task is to identify the Nodes and Relations requested with the user prompt from a given file.",
      model: "gpt-4o-mini",
      tools: [{ type: "file_search" }],
      temperature: 0.0,
    });

    const inputFile = await openai.files.create({
      file: fs.createReadStream(localFilePath),
      purpose: "assistants",
    });

    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: "user",
          content: schema
            ? generateSystemMessageWithSchema(String(schema))
            : generateSystemMessage(),
          attachments: [
            { file_id: inputFile.id, tools: [{ type: "file_search" }] },
          ],
        },
      ],
    });
    console.log("thread's vector store: ", thread.tool_resources?.file_search);
    console.log(
      "prompt: ",
      schema
        ? generateSystemMessageWithSchema(String(schema))
        : generateSystemMessage(),
    );

    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id, // or "asst_jTbI1u826T6wkvn5A1zXoGSt"
    });

    const messages = await openai.beta.threads.messages.list(thread.id, {
      run_id: run.id,
    });
    const message = messages.data.pop()!;

    if (message?.content[0]!.type === "text") {
      const { text } = message.content[0];
      console.log(text.value);

      const nodesAndRelationships = getNodesAndRelationshipsFromResult(
        text.value,
      );
      // 型が合わなくなったので、一旦使わない
      return { nodes: [], relationships: [] };
    }
    return null;
  }
}
