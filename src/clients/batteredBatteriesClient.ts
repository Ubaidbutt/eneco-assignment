import axios, { type AxiosError, type AxiosInstance } from "axios";

import type { BatteredBatteriesSetpointRequest } from "../setpoints/types.js";

export interface BatteredBatteriesClient {
  sendSetpoint(
    deviceId: string,
    setpoint: BatteredBatteriesSetpointRequest,
  ): Promise<void>;
}

export class BatteredBatteriesApiError extends Error {
  public readonly retryable: boolean;
  public readonly status: number | undefined;

  public constructor(
    message: string,
    options: {
      retryable: boolean;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "BatteredBatteriesApiError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
}

interface ClassifiedError {
  error: BatteredBatteriesApiError;
  retryAfterMs?: number;
}

const MAX_RETRY_DELAY_MS = 2000;

function rebaseSetpointForAttempt(
  setpoint: BatteredBatteriesSetpointRequest,
): BatteredBatteriesSetpointRequest {
  const durationSeconds = setpoint.data.endTime - setpoint.data.startTime;
  const startTime = Math.ceil(Date.now() / 1000) + 1;

  return {
    data: {
      startTime,
      endTime: startTime + durationSeconds,
      value: setpoint.data.value,
    },
  };
}

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

function retryAfterMilliseconds(error: AxiosError): number | undefined {
  const header = error.response?.headers["retry-after"];
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value === "number") {
    return Math.max(0, value * 1000);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function classifyError(error: unknown): ClassifiedError {
  if (error instanceof BatteredBatteriesApiError) {
    return { error };
  }

  if (!axios.isAxiosError(error)) {
    // An implementation failure is not evidence that the command is invalid.
    throw new Error("Unexpected API client failure");
  }

  const status = error.response?.status;
  if (status === 401 || status === 403) {
    // Retrying locally cannot repair credentials. Preserve the uncompleted
    // commands and stop this batch rather than consuming it during an outage.
    throw new Error(
      "Battered Batteries API authentication or authorization failed",
    );
  }
  const retryable =
    status === undefined || status === 408 || status === 429 || status >= 500;

  const classifiedError = new BatteredBatteriesApiError(
    status === undefined
      ? "Battered Batteries API request failed without a response"
      : `Battered Batteries API returned HTTP ${status}`,
    {
      retryable,
      ...(status === undefined ? {} : { status }),
      cause: error,
    },
  );
  const retryAfterMs =
    status === 429 ? retryAfterMilliseconds(error) : undefined;

  return retryAfterMs === undefined
    ? { error: classifiedError }
    : { error: classifiedError, retryAfterMs };
}

export class AxiosBatteredBatteriesClient implements BatteredBatteriesClient {
  private readonly httpClient: AxiosInstance;
  private readonly maxRetries: number;

  public constructor(options: ClientOptions) {
    this.httpClient = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": options.apiKey,
      },
    });
    this.maxRetries = options.maxRetries;
  }

  public async sendSetpoint(
    deviceId: string,
    setpoint: BatteredBatteriesSetpointRequest,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const attemptSetpoint = rebaseSetpointForAttempt(setpoint);
        const response = await this.httpClient.post(
          `/${encodeURIComponent(deviceId)}/setpoint`,
          attemptSetpoint,
        );

        if (response.status !== 204) {
          throw new BatteredBatteriesApiError(
            `Battered Batteries API returned unexpected HTTP ${response.status}`,
            { retryable: false, status: response.status },
          );
        }

        return;
      } catch (error: unknown) {
        const classified = classifyError(error);
        if (!classified.error.retryable || attempt >= this.maxRetries) {
          throw classified.error;
        }

        const exponentialBackoffMs = 250 * 2 ** attempt;
        const jitterMs = Math.floor(Math.random() * 100);
        // Stop local retries for longer delays. Abandonment can immediately
        // redeliver the message; this does NOT enforce a shared cooldown.
        if (
          classified.retryAfterMs !== undefined &&
          classified.retryAfterMs > MAX_RETRY_DELAY_MS
        ) {
          throw classified.error;
        }

        await sleep(
          classified.retryAfterMs ??
            Math.min(exponentialBackoffMs + jitterMs, MAX_RETRY_DELAY_MS),
        );
      }
    }
  }
}
