import "@azure/functions-extensions-servicebus";
import {
  messageBodyAsJson,
  type ServiceBusMessageContext,
} from "@azure/functions-extensions-servicebus";
import { app, type InvocationContext } from "@azure/functions";

import { AxiosBatteredBatteriesClient } from "../clients/batteredBatteriesClient.js";
import { loadConfig } from "../config.js";
import { processSetpointBatch } from "../setpoints/processSetpointBatch.js";

export async function forwardSetpoints(
  input: ServiceBusMessageContext,
  context: InvocationContext,
): Promise<void> {
  const config = loadConfig();
  const client = new AxiosBatteredBatteriesClient({
    baseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
    maxRetries: config.maxRetries,
  });

  const messages = input.messages.map((message) => ({
    readBody: () => messageBodyAsJson(message),
    complete: () => input.actions.complete(message),
    abandon: () => input.actions.abandon(message),
  }));

  await processSetpointBatch(messages, { client }, context);
}

app.serviceBusQueue("forwardSetpoints", {
  queueName: "sbq-batbat-spt",
  connection: "CONNECTION-STRING-SBQ-BATBAT-SPT",
  cardinality: "many",
  sdkBinding: true,
  autoCompleteMessages: false,
  handler: forwardSetpoints,
});
