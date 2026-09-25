Create a function that consumes batches of setpoint from a servicebus, then publishes them to a fictional api for steering home batteries

Setpoints should be forwarded to the battered batteries api, battered batteries is a brand of home batteries known just as much for their cheap and unreliable batteries (customers report the batteries sometimes not responding for minutes at a time), as for their poor customer service and tendency to cut corners on everything.
After endless hassling, you've finally received a swagger specification and an api key. Asking for a test environment only leads to their eyes glazing over and one person mentioning "not to overload the api", it seems the swagger is all you have to go on.
The one explanation they do provide is how setpoints are overridden: only one setpoint ever exists, and new setpoints override old ones. instead of providing a DELETE operation, they show a demonstration where they remove an old setpoint by sending a new one with a duration of a second, leading to a clean slate.

api-key: 'oYMBYY5L4ZWk2UVdLwg9Nd6uiz9qpcLq'

function should

- Be written in typescript
- Use the v4 programming model
- Use the following npm packages: @azure/functions, and axios for http calls
- Use vitest as a testing framework

Incoming setpoints:
```json
{
  "device_id": "BB00001",
  "setpoint": {
    "value": 1,
    "unit": "kW",
    "endTime": "2025-01-01T10:01:00.000Z"
  },
  "eventTime": "2025-01-01T10:00:00.000Z"
}
```

Setpoint durations vary between 1 minute to up to an hour, setpoints should always be active from moment of arrival.
Setpoints are always in killoWatt, and are sent from the grid perspective, this means negative values should lead to a battery charging, and positive values to the battery discharging.

ServiceBus details:
queue: sbq-batbat-spt
connection string is added to the function using the following environment variable: 'CONNECTION-STRING-SBQ-BATBAT-SPT'

Other:
Implement filtering on device_ids, if it is not part of a known list, abandon it, this list can be hardcoded

Accepted devices:
```javascript
['BB00001', 'BB00005', 'BB00006', 'BB00007', 'BB00293']
```

Include 1 test, provide all other tests as a list of TODO comments.
Comments should be descriptive, not "Add tests for unhappy flow", but "Add test for function x if api returns a 429 result, should retry"

