export const ACCEPTED_DEVICE_IDS: ReadonlySet<string> = new Set([
  "BB00001",
  "BB00005",
  "BB00006",
  "BB00007",
  "BB00293",
]);

export interface AppConfig {
  apiBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
  maxRetries: number;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Required environment variable ${name} is not configured`);
  }

  return value;
}

function nonNegativeIntegerEnvironmentVariable(
  name: string,
  defaultValue: number,
): number {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue = Number(value);
  if (value.trim() === "" || !Number.isSafeInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsedValue;
}

export function loadConfig(): AppConfig {
  const requestTimeoutMs = nonNegativeIntegerEnvironmentVariable(
    "BATTERED_BATTERIES_TIMEOUT_MS",
    5000,
  );
  if (requestTimeoutMs === 0) {
    throw new Error("BATTERED_BATTERIES_TIMEOUT_MS must be positive");
  }

  return {
    apiBaseUrl:
      process.env.BATTERED_BATTERIES_BASE_URL ?? "https://BatB.azure-api.net",
    apiKey: requiredEnvironmentVariable("BATTERED_BATTERIES_API_KEY"),
    requestTimeoutMs,
    maxRetries: nonNegativeIntegerEnvironmentVariable(
      "BATTERED_BATTERIES_MAX_RETRIES",
      1,
    ),
  };
}
