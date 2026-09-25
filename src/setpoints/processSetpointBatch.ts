import type { InvocationContext } from "@azure/functions";

import {
  BatteredBatteriesApiError,
  type BatteredBatteriesClient,
} from "../clients/batteredBatteriesClient.js";
import { ACCEPTED_DEVICE_IDS } from "../config.js";
import { mapSetpoint } from "./mapSetpoint.js";
import { parseIncomingSetpointMessage } from "./types.js";

export interface ProcessBatchDependencies {
  client: BatteredBatteriesClient;
  now?: () => Date;
  acceptedDeviceIds?: ReadonlySet<string>;
}

export interface SetpointBatchMessage {
  readBody(): unknown;
  complete(): Promise<void>;
  abandon(): Promise<void>;
}

type Logger = Pick<InvocationContext, "log" | "warn" | "error">;

function safeErrorDetails(error: BatteredBatteriesApiError): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    retryable: error.retryable,
    status: error.status,
  };
}

export async function processSetpointBatch(
  messages: readonly SetpointBatchMessage[],
  dependencies: ProcessBatchDependencies,
  logger: Logger,
): Promise<void> {
  const now = dependencies.now ?? (() => new Date());
  const acceptedDeviceIds =
    dependencies.acceptedDeviceIds ?? ACCEPTED_DEVICE_IDS;

  logger.log(`Received a batch of ${messages.length} setpoint message(s)`);

  let settlementFailures = 0;
  async function settle(
    message: SetpointBatchMessage,
    action: "complete" | "abandon",
    index: number,
  ): Promise<void> {
    try {
      await message[action]();
    } catch {
      settlementFailures += 1;
      logger.error(
        `Service Bus ${action} failed at batch index ${index}; settlement outcome is uncertain and redelivery is possible`,
      );
      // Do not attempt a different settlement after an uncertain outcome.
      // Continue handling other messages before failing the invocation.
    }
  }

  // Deliberately process the batch sequentially. This preserves order inside
  // one invocation and limits API concurrency to one within that invocation.
  for (const [index, batchMessage] of messages.entries()) {
    let rawMessage;

    try {
      rawMessage = batchMessage.readBody();
    } catch (error: unknown) {
      logger.warn(
        `Ignoring malformed setpoint message at batch index ${index}`,
        error,
      );
      await settle(batchMessage, "complete", index);
      continue;
    }

    let message;

    try {
      message = parseIncomingSetpointMessage(rawMessage);
    } catch (error: unknown) {
      logger.warn(
        `Ignoring malformed setpoint message at batch index ${index}`,
        error,
      );
      await settle(batchMessage, "complete", index);
      continue;
    }

    if (!acceptedDeviceIds.has(message.device_id)) {
      logger.warn(`Ignoring setpoint for unknown device ${message.device_id}`);
      await settle(batchMessage, "complete", index);
      continue;
    }

    let request;
    try {
      request = mapSetpoint(message, now());
    } catch (error: unknown) {
      logger.warn(`Ignoring invalid setpoint for ${message.device_id}`, error);
      await settle(batchMessage, "complete", index);
      continue;
    }

    try {
      await dependencies.client.sendSetpoint(message.device_id, request);
    } catch (error: unknown) {
      if (!(error instanceof BatteredBatteriesApiError)) {
        logger.error(
          `Unexpected client or authentication failure for ${message.device_id}; stopping the batch without settling this or later messages`,
        );
        // Do not propagate an arbitrary error that could expose credentials.
        throw new Error(
          "Setpoint processing stopped after a client or authentication failure",
        );
      }

      if (!error.retryable) {
        logger.error(
          `Permanent API failure for ${message.device_id}; message will not be retried`,
          safeErrorDetails(error),
        );
        await settle(batchMessage, "complete", index);
        continue;
      }

      logger.error(
        `Retryable API failure for ${message.device_id}; message will be retried`,
        safeErrorDetails(error),
      );
      await settle(batchMessage, "abandon", index);
      continue;
    }

    logger.log(`Forwarded setpoint for ${message.device_id}`);
    await settle(batchMessage, "complete", index);
  }

  if (settlementFailures > 0) {
    throw new Error(
      `Service Bus settlement failed for ${settlementFailures} message(s)`,
    );
  }
}
