export interface IncomingSetpointMessage {
  device_id: string;
  setpoint: {
    value: number;
    unit: "kW";
    endTime: string;
  };
  eventTime: string;
}

export interface BatteredBatteriesSetpointRequest {
  data: {
    startTime: number;
    endTime: number;
    value: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseIncomingSetpointMessage(
  value: unknown,
): IncomingSetpointMessage {
  if (!isRecord(value)) {
    throw new Error("Message must be an object");
  }

  if (typeof value.device_id !== "string" || value.device_id.length === 0) {
    throw new Error("device_id must be a non-empty string");
  }

  if (typeof value.eventTime !== "string") {
    throw new Error("eventTime must be an ISO timestamp string");
  }

  if (!isRecord(value.setpoint)) {
    throw new Error("setpoint must be an object");
  }

  const setpoint = value.setpoint;
  if (typeof setpoint.value !== "number" || !Number.isFinite(setpoint.value)) {
    throw new Error("setpoint.value must be a finite number");
  }

  if (setpoint.unit !== "kW") {
    throw new Error("setpoint.unit must be kW");
  }

  if (typeof setpoint.endTime !== "string") {
    throw new Error("setpoint.endTime must be an ISO timestamp string");
  }

  return {
    device_id: value.device_id,
    eventTime: value.eventTime,
    setpoint: {
      value: setpoint.value,
      unit: setpoint.unit,
      endTime: setpoint.endTime,
    },
  };
}
