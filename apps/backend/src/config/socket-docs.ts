import { asyncApiSpec } from "./asyncapi";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderSocketDocs(): string {
  const operationCards = Object.entries(asyncApiSpec.operations)
    .map(([operationId, operation]) => {
      const channelRef = operation.channel.$ref;
      const channelKey = channelRef.split("/").at(-1) as keyof typeof asyncApiSpec.channels;
      const channel = asyncApiSpec.channels[channelKey];
      const messageRef = Object.values(channel.messages)[0].$ref;
      const messageKey = messageRef.split("/").at(-1) as keyof typeof asyncApiSpec.components.messages;
      const message = asyncApiSpec.components.messages[messageKey];
      const payloadRef = "$ref" in message.payload ? message.payload.$ref : undefined;
      const payloadKey = payloadRef?.split("/").at(-1) as
        | keyof typeof asyncApiSpec.components.schemas
        | undefined;
      const payloadSchema = payloadKey
        ? asyncApiSpec.components.schemas[payloadKey]
        : message.payload;
      const payload = JSON.stringify(payloadSchema, null, 2);
      const acknowledgement =
        "x-socketio-ack" in message
          ? `<details class="schema-block" open><summary>Acknowledgement schema</summary><pre>${escapeHtml(
              JSON.stringify(
                asyncApiSpec.components.schemas.TerminalAckPayload,
                null,
                2,
              ),
            )}</pre></details>`
          : "";

      return `
        <article class="event-card">
          <div class="event-header">
            <span class="direction ${operation.action}">${escapeHtml(operation.action)}</span>
            <code>${escapeHtml(channel.address)}</code>
          </div>
          <h2>${escapeHtml(operation.summary)}</h2>
          <p>${escapeHtml(channel.description)}</p>
          <details class="schema-block" open>
            <summary>Payload schema</summary>
            <pre>${escapeHtml(payload)}</pre>
          </details>
          ${acknowledgement}
          <small>${escapeHtml(operationId)}</small>
        </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EnvOps Socket.IO API</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    body { max-width: 1280px; margin: 0 auto; padding: 32px 24px 64px; }
    header { margin-bottom: 28px; }
    header p { max-width: 760px; line-height: 1.6; opacity: .8; }
    nav { display: flex; gap: 16px; margin: 18px 0; }
    a { color: inherit; }
    .events { display: flex; flex-direction: column; gap: 18px; }
    .event-card { width: 100%; box-sizing: border-box; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 14px; padding: 22px; }
    .event-header { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
    .direction { text-transform: uppercase; font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 999px; }
    .receive { background: rgba(44, 130, 201, .18); }
    .send { background: rgba(39, 174, 96, .18); }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .schema-block { width: 100%; margin-top: 16px; }
    .schema-block summary { cursor: pointer; font-weight: 700; padding: 10px 0; }
    pre { width: 100%; box-sizing: border-box; overflow-x: auto; margin: 4px 0 0; padding: 16px; border-radius: 10px; background: rgba(127,127,127,.12); line-height: 1.55; white-space: pre; }
    h2 { font-size: 19px; margin: 16px 0 8px; }
    .event-card p { max-width: 900px; line-height: 1.6; opacity: .82; }
    small { opacity: .55; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(asyncApiSpec.info.title)}</h1>
    <p>${escapeHtml(asyncApiSpec.info.description)}</p>
    <nav>
      <a href="/asyncapi.json">Raw AsyncAPI JSON</a>
      <a href="/api-docs">REST Swagger UI</a>
    </nav>
    <p><strong>Direction:</strong> receive = frontend → backend, send = backend → frontend.</p>
  </header>
  <main class="events">${operationCards}</main>
</body>
</html>`;
}
