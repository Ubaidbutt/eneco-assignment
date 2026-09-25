import type {
  BatteredBatteriesSetpointRequest,
  IncomingSetpointMessage,
} from "./types.js";

const MINIMUM_DURATION_MS = 60000;
const MAXIMUM_DURATION_MS = 60 * 60000;

function parseTimestamp(value: string, fieldName: string): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} must be a valid ISO timestamp`);
  }

  return timestamp;
}

function kilowattsToWatts(kilowatts: number): number {
  const watts = kilowatts * -1000;
  const roundedWatts = Math.round(watts);

  // Allow tiny floating-point errors, such as 1.001 kW becoming 1000.9999999999999 W.
  if (!Number.isSafeInteger(roundedWatts) || Math.abs(watts - roundedWatts) > 0.000001) {
    throw new Error(
      "setpoint.value must convert to a whole, safe number of watts",
    );
  }

  return roundedWatts === 0 ? 0 : roundedWatts;
}

export function mapSetpoint(
  message: IncomingSetpointMessage,
  now: Date,
): BatteredBatteriesSetpointRequest {
  const eventTimeMs = parseTimestamp(message.eventTime, "eventTime");
  const endTimeMs = parseTimestamp(message.setpoint.endTime, "setpoint.endTime");
  const durationMs = endTimeMs - eventTimeMs;

  if (durationMs < MINIMUM_DURATION_MS || durationMs > MAXIMUM_DURATION_MS) {
    throw new Error("Setpoint duration must be between 1 minute and 1 hour");
  }

  const watts = kilowattsToWatts(message.setpoint.value);

  // The API requires an integer timestamp in the future. This gives the HTTP
  // request at least one full second to reach the API, but slow delivery or
  // clock skew can still make it stale before the API validates it.
  const startTime = Math.ceil(now.getTime() / 1000) + 1;
  const durationSeconds = Math.ceil(durationMs / 1000);

  return {
    data: {
      startTime,
      endTime: startTime + durationSeconds,
      value: watts,
    },
  };
}
