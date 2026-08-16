import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/sandbox.service", () => ({
  getSandboxById: vi.fn(),
}));

vi.mock("../ai/error-interceptor.service", () => ({
  errorInterceptorService: { explain: vi.fn() },
}));

vi.mock("../error-interceptor/capture.service", () => ({
  errorCaptureRegistry: { getLastFailure: vi.fn() },
}));

import { Request, Response } from "express";
import { getSandboxById } from "../services/sandbox.service";
import { errorInterceptorService } from "../ai/error-interceptor.service";
import { errorCaptureRegistry } from "../error-interceptor/capture.service";
import { explainError } from "./explain-error.controller";

const sandbox = {
  id: "sandbox-42",
  template: {
    id: "template-1",
    displayName: "Terraform Lab",
    dockerImage: "hashicorp/terraform:1.7",
  },
};

function makeReq(overrides: Partial<Request> = {}) {
  return {
    params: { id: "sandbox-42" },
    user: { id: "user-1" },
    body: {},
    ...overrides,
  } as unknown as Request<{ id: string }>;
}

function makeRes() {
  const res = { json: vi.fn() };
  res.json.mockReturnValue(res);
  return res as unknown as Response;
}

describe("explainError controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSandboxById).mockResolvedValue(sandbox as never);
    vi.mocked(errorInterceptorService.explain).mockResolvedValue({
      status: "available",
      explanation: "port is in use",
      suggestedFix: "kill the process",
      model: "deepseek.v3.2",
      generatedAt: "2026-08-17T00:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unavailable without calling the LLM when nothing has been captured", async () => {
    vi.mocked(errorCaptureRegistry.getLastFailure).mockReturnValue(null);
    const res = makeRes();

    await explainError(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({
      status: "unavailable",
      reason: "no_failure_captured",
      retryable: false,
    });
    expect(errorInterceptorService.explain).not.toHaveBeenCalled();
  });

  it("uses the captured failure when the body has no command or stderr", async () => {
    vi.mocked(errorCaptureRegistry.getLastFailure).mockReturnValue({
      command: "npm install",
      stderr: "npm ERR! code ERESOLVE",
      detectedAt: new Date("2026-08-17T00:00:00.000Z"),
    });
    const res = makeRes();

    await explainError(makeReq(), res);

    expect(errorInterceptorService.explain).toHaveBeenCalledWith({
      sandbox: { template: sandbox.template },
      command: "npm install",
      stderr: "npm ERR! code ERESOLVE",
      environmentType: undefined,
    });
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  it("prefers the body command and stderr over any captured failure", async () => {
    vi.mocked(errorCaptureRegistry.getLastFailure).mockReturnValue({
      command: "npm install",
      stderr: "npm ERR! code ERESOLVE",
      detectedAt: new Date("2026-08-17T00:00:00.000Z"),
    });
    const res = makeRes();

    await explainError(
      makeReq({ body: { command: "kubectl describe pod", stderr: "Error: NotFound", environmentType: "kubernetes" } }),
      res,
    );

    expect(errorInterceptorService.explain).toHaveBeenCalledWith({
      sandbox: { template: sandbox.template },
      command: "kubectl describe pod",
      stderr: "Error: NotFound",
      environmentType: "kubernetes",
    });
  });

  it("forwards the LLM result as the response", async () => {
    vi.mocked(errorCaptureRegistry.getLastFailure).mockReturnValue({
      command: "npm install",
      stderr: "npm ERR! code ERESOLVE",
      detectedAt: new Date("2026-08-17T00:00:00.000Z"),
    });
    const res = makeRes();

    await explainError(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({
      status: "available",
      explanation: "port is in use",
      suggestedFix: "kill the process",
      model: "deepseek.v3.2",
      generatedAt: "2026-08-17T00:00:00.000Z",
    });
  });
});