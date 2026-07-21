import { env } from "./env";

export const asyncApiSpec = {
  asyncapi: "3.0.0",
  info: {
    title: "EnvOps Terminal Socket.IO API",
    version: "1.0.0",
    description:
      "Event contract between the browser terminal and the EnvOps backend. " +
      "The frontend sends only the sandboxId; the backend resolves and validates the namespace and Pod.",
  },
  defaultContentType: "application/json",
  servers: {
    local: {
      host: `localhost:${env.port}`,
      protocol: "socket.io",
      description: "Local Socket.IO server",
      pathname: "/socket.io",
    },
  },
  channels: {
    terminalStart: {
      address: "terminal:start",
      messages: {
        terminalStart: { $ref: "#/components/messages/TerminalStart" },
      },
      description: "Starts an interactive terminal for a sandbox.",
    },
    terminalInput: {
      address: "terminal:input",
      messages: {
        terminalInput: { $ref: "#/components/messages/TerminalInput" },
      },
      description: "Forwards keyboard input to the active terminal.",
    },
    terminalResize: {
      address: "terminal:resize",
      messages: {
        terminalResize: { $ref: "#/components/messages/TerminalResize" },
      },
      description: "Resizes the active pseudo-terminal.",
    },
    terminalStop: {
      address: "terminal:stop",
      messages: {
        terminalStop: { $ref: "#/components/messages/TerminalStop" },
      },
      description: "Closes the current terminal session without deleting the sandbox.",
    },
    terminalStarted: {
      address: "terminal:started",
      messages: {
        terminalStarted: { $ref: "#/components/messages/TerminalStarted" },
      },
      description: "Confirms that the backend attached to the sandbox Pod.",
    },
    terminalOutput: {
      address: "terminal:output",
      messages: {
        terminalOutput: { $ref: "#/components/messages/TerminalOutput" },
      },
      description: "Streams terminal output to the frontend.",
    },
    terminalExit: {
      address: "terminal:exit",
      messages: {
        terminalExit: { $ref: "#/components/messages/TerminalExit" },
      },
      description: "Reports that the PTY process exited.",
    },
    terminalError: {
      address: "terminal:error",
      messages: {
        terminalError: { $ref: "#/components/messages/TerminalError" },
      },
      description: "Reports validation, authorization, or terminal failures.",
    },
  },
  operations: {
    receiveTerminalStart: {
      action: "receive",
      channel: { $ref: "#/channels/terminalStart" },
      summary: "Receive terminal:start from the frontend",
    },
    receiveTerminalInput: {
      action: "receive",
      channel: { $ref: "#/channels/terminalInput" },
      summary: "Receive terminal:input from the frontend",
    },
    receiveTerminalResize: {
      action: "receive",
      channel: { $ref: "#/channels/terminalResize" },
      summary: "Receive terminal:resize from the frontend",
    },
    receiveTerminalStop: {
      action: "receive",
      channel: { $ref: "#/channels/terminalStop" },
      summary: "Receive terminal:stop from the frontend",
    },
    sendTerminalStarted: {
      action: "send",
      channel: { $ref: "#/channels/terminalStarted" },
      summary: "Send terminal:started to the frontend",
    },
    sendTerminalOutput: {
      action: "send",
      channel: { $ref: "#/channels/terminalOutput" },
      summary: "Send terminal:output to the frontend",
    },
    sendTerminalExit: {
      action: "send",
      channel: { $ref: "#/channels/terminalExit" },
      summary: "Send terminal:exit to the frontend",
    },
    sendTerminalError: {
      action: "send",
      channel: { $ref: "#/channels/terminalError" },
      summary: "Send terminal:error to the frontend",
    },
  },
  components: {
    messages: {
      TerminalStart: {
        name: "terminal:start",
        title: "Start terminal",
        summary: "Frontend requests a terminal for a sandbox.",
        payload: { $ref: "#/components/schemas/TerminalStartPayload" },
        "x-socketio-ack": {
          description: "Optional acknowledgement callback payload returned by the backend.",
          schema: { $ref: "#/components/schemas/TerminalAckPayload" },
        },
      },
      TerminalInput: {
        name: "terminal:input",
        title: "Terminal input",
        payload: { $ref: "#/components/schemas/TerminalInputPayload" },
      },
      TerminalResize: {
        name: "terminal:resize",
        title: "Terminal resize",
        payload: { $ref: "#/components/schemas/TerminalResizePayload" },
      },
      TerminalStop: {
        name: "terminal:stop",
        title: "Stop terminal",
        payload: {
          type: "object",
          description: "No payload is required.",
          additionalProperties: false,
        },
      },
      TerminalStarted: {
        name: "terminal:started",
        title: "Terminal started",
        payload: { $ref: "#/components/schemas/TerminalStartedPayload" },
      },
      TerminalOutput: {
        name: "terminal:output",
        title: "Terminal output",
        payload: { $ref: "#/components/schemas/TerminalOutputPayload" },
      },
      TerminalExit: {
        name: "terminal:exit",
        title: "Terminal exit",
        payload: { $ref: "#/components/schemas/TerminalExitPayload" },
      },
      TerminalError: {
        name: "terminal:error",
        title: "Terminal error",
        payload: { $ref: "#/components/schemas/TerminalErrorPayload" },
      },
    },
    schemas: {
      TerminalStartPayload: {
        type: "object",
        required: ["sandboxId"],
        additionalProperties: false,
        properties: {
          sandboxId: { type: "string", format: "uuid" },
          cols: { type: "integer", minimum: 1, maximum: 500, default: 100 },
          rows: { type: "integer", minimum: 1, maximum: 500, default: 30 },
        },
      },
      TerminalInputPayload: {
        type: "object",
        required: ["data"],
        additionalProperties: false,
        properties: {
          data: { type: "string", examples: ["ls\r", "\u0003"] },
        },
      },
      TerminalResizePayload: {
        type: "object",
        required: ["cols", "rows"],
        additionalProperties: false,
        properties: {
          cols: { type: "integer", minimum: 1, maximum: 500, example: 120 },
          rows: { type: "integer", minimum: 1, maximum: 500, example: 40 },
        },
      },
      TerminalStartedPayload: {
        type: "object",
        required: ["sandboxId", "namespace", "podName"],
        properties: {
          sandboxId: { type: "string", format: "uuid" },
          namespace: { type: "string", example: "sandbox-1784661672464" },
          podName: { type: "string", example: "sandbox-terminal" },
          containerName: { type: "string", example: "sandbox-container" },
        },
      },
      TerminalOutputPayload: {
        type: "object",
        required: ["data"],
        properties: {
          data: { type: "string", example: "/workspace # " },
        },
      },
      TerminalExitPayload: {
        type: "object",
        properties: {
          exitCode: { type: "integer", example: 0 },
          signal: { type: "integer", example: 15 },
        },
      },
      TerminalAckPayload: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
          error: { $ref: "#/components/schemas/TerminalErrorPayload" },
          terminal: { $ref: "#/components/schemas/TerminalStartedPayload" },
        },
        examples: [
          {
            ok: true,
            terminal: {
              sandboxId: "31884bc3-86db-4687-8ee7-40abd578dafb",
              namespace: "sandbox-1784661672464",
              podName: "sandbox-terminal",
              containerName: "sandbox-container",
            },
          },
        ],
      },
      TerminalErrorPayload: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: {
            type: "string",
            enum: [
              "INVALID_PAYLOAD",
              "UNAUTHORIZED",
              "SANDBOX_NOT_FOUND",
              "SANDBOX_NOT_RUNNING",
              "SANDBOX_EXPIRED",
              "SANDBOX_POD_NOT_FOUND",
              "TERMINAL_NOT_STARTED",
              "TERMINAL_ALREADY_STARTING",
              "TERMINAL_START_FAILED",
              "INPUT_TOO_LARGE",
              "INTERNAL_ERROR",
            ],
          },
          message: { type: "string" },
        },
      },
    },
  },
} as const;
