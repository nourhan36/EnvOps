import { describe, expect, it } from "vitest";
import {
  RESOURCE_BOUNDS,
  bytesToMemory,
  clampCpu,
  clampMemory,
  clampTtlMinutes,
  cpuToMillicores,
  isCpuQuantity,
  isMemoryQuantity,
  memoryToBytes,
  millicoresToCpu,
} from "./sandbox-resources";

describe("sandbox resource helpers", () => {
  describe("cpu quantity parsing", () => {
    it("accepts valid Kubernetes CPU quantities", () => {
      expect(isCpuQuantity("500m")).toBe(true);
      expect(isCpuQuantity("1")).toBe(true);
      expect(isCpuQuantity("0.5")).toBe(true);
      expect(isCpuQuantity("2500m")).toBe(true);
      expect(isCpuQuantity("2.000")).toBe(true);
    });

    it("rejects malformed CPU quantities", () => {
      expect(isCpuQuantity("")).toBe(false);
      expect(isCpuQuantity("-1")).toBe(false);
      expect(isCpuQuantity("1.5m")).toBe(false);
      expect(isCpuQuantity("1G")).toBe(false);
      expect(isCpuQuantity("m")).toBe(false);
      expect(isCpuQuantity("1.2345")).toBe(false);
      expect(isCpuQuantity("abc")).toBe(false);
    });

    it("converts CPU quantities to millicores", () => {
      expect(cpuToMillicores("500m")).toBe(500);
      expect(cpuToMillicores("1")).toBe(1000);
      expect(cpuToMillicores("0.5")).toBe(500);
      expect(cpuToMillicores("1.5")).toBe(1500);
    });

    it("returns null for invalid CPU quantities", () => {
      expect(cpuToMillicores("")).toBeNull();
      expect(cpuToMillicores("-2")).toBeNull();
      expect(cpuToMillicores("1Gi")).toBeNull();
    });
  });

  describe("memory quantity parsing", () => {
    it("accepts valid Kubernetes memory quantities", () => {
      expect(isMemoryQuantity("128Mi")).toBe(true);
      expect(isMemoryQuantity("512Mi")).toBe(true);
      expect(isMemoryQuantity("1Gi")).toBe(true);
      expect(isMemoryQuantity("1048576")).toBe(true);
      expect(isMemoryQuantity("512Ki")).toBe(true);
      expect(isMemoryQuantity("1G")).toBe(true);
    });

    it("rejects malformed memory quantities", () => {
      expect(isMemoryQuantity("")).toBe(false);
      expect(isMemoryQuantity("-128Mi")).toBe(false);
      expect(isMemoryQuantity("128M i")).toBe(false);
      expect(isMemoryQuantity("MB")).toBe(false);
      expect(isMemoryQuantity("abc")).toBe(false);
    });

    it("converts memory quantities to bytes", () => {
      expect(memoryToBytes("128Mi")).toBe(128 * 1024 ** 2);
      expect(memoryToBytes("1Gi")).toBe(1024 ** 3);
      expect(memoryToBytes("512Ki")).toBe(512 * 1024);
      expect(memoryToBytes("1048576")).toBe(1048576);
      expect(memoryToBytes("2G")).toBe(2 * 1000 ** 3);
    });

    it("returns null for invalid memory quantities", () => {
      expect(memoryToBytes("")).toBeNull();
      expect(memoryToBytes("-1Gi")).toBeNull();
      expect(memoryToBytes("500m")).toBeNull();
    });
  });

  describe("clamping", () => {
    it("clamps oversized CPU to the platform maximum", () => {
      expect(clampCpu("32", "500m")).toBe(millicoresToCpu(RESOURCE_BOUNDS.cpu.max));
    });

    it("clamps undersized CPU to the platform minimum", () => {
      expect(clampCpu("10m", "500m")).toBe(millicoresToCpu(RESOURCE_BOUNDS.cpu.min));
    });

    it("passes through in-range CPU values", () => {
      expect(clampCpu("1", "500m")).toBe("1");
    });

    it("falls back to the template default when CPU is invalid or missing", () => {
      expect(clampCpu(undefined, "500m")).toBe("500m");
      expect(clampCpu("banana", "1")).toBe("1");
    });

    it("clamps oversized memory to the platform maximum", () => {
      expect(memoryToBytes(clampMemory("64Gi", "256Mi"))).toBe(RESOURCE_BOUNDS.memory.max);
    });

    it("clamps undersized memory to the platform minimum", () => {
      expect(memoryToBytes(clampMemory("16Mi", "256Mi"))).toBe(RESOURCE_BOUNDS.memory.min);
    });

    it("passes through in-range memory values", () => {
      expect(clampMemory("1Gi", "256Mi")).toBe("1Gi");
    });

    it("falls back to the template default when memory is invalid or missing", () => {
      expect(clampMemory(undefined, "256Mi")).toBe("256Mi");
      expect(clampMemory("nope", "512Mi")).toBe("512Mi");
    });

    it("clamps TTL into the allowed range", () => {
      expect(clampTtlMinutes(1, 60)).toBe(RESOURCE_BOUNDS.ttlMinutes.min);
      expect(clampTtlMinutes(10_000, 60)).toBe(RESOURCE_BOUNDS.ttlMinutes.max);
      expect(clampTtlMinutes(90, 60)).toBe(90);
    });

    it("falls back to the template default when TTL is missing or not an integer", () => {
      expect(clampTtlMinutes(undefined, 60)).toBe(60);
      expect(clampTtlMinutes(45.5, 60)).toBe(60);
      expect(clampTtlMinutes(NaN, 60)).toBe(60);
    });
  });

  describe("formatting", () => {
    it("formats millicores back into CPU quantities", () => {
      expect(millicoresToCpu(1000)).toBe("1");
      expect(millicoresToCpu(500)).toBe("500m");
    });

    it("formats bytes back into Mi", () => {
      expect(bytesToMemory(256 * 1024 ** 2)).toBe("256Mi");
      expect(bytesToMemory(1024 ** 3)).toBe("1024Mi");
    });
  });
});