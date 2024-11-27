import { Server } from "node:net";
import { describe, test, expect, afterEach, vi } from "vitest";
import { getPort, getRandomPort } from "../src";
import { _generateRange } from "../src/_internal";
import { blockPort } from "./utils";

const isWindows = process.platform === "win32";

describe("getPort", () => {
  let portBlocker: Server;

  afterEach(() => {
    portBlocker?.close();
  });

  describe("default host", () => {
    test("default port is not in use", async () => {
      const port = await getPort();
      expect(port).toEqual(3000);
    });

    test("default port is in use", async () => {
      portBlocker = await blockPort(3000);
      const port = await getPort();
      expect(port).toEqual(3001);
    });
  });

  describe("order", () => {
    test("ports is preferred", async () => {
      const port = await getPort({ ports: [8080] });
      expect(port).toEqual(8080);
    });

    test("portRange is preferred over random", async () => {
      const port = await getPort({ random: true, portRange: [8081, 8085] });
      expect(port).toEqual(8081);
    });
  });

  describe("localhost", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    test("default port is not in use", async () => {
      const port = await getPort({ host: "localhost" });
      expect(port).toEqual(3000);
    });

    test("default port is in use", async () => {
      vi.stubEnv("HOST", "localhost");

      portBlocker = await blockPort(3000, "localhost");
      const port1 = await getPort({ port: 3000, portRange: [3000, 3100] });
      expect(port1).toEqual(3001);
      const port2 = await getPort();
      expect(port2).toEqual(3001);
      const port3 = await getPort(3000);
      expect(port3).not.toEqual(3001);
    });
  });

  describe("ipv6", () => {
    test("get port on ::1", async () => {
      await blockPort(3000, "::1");
      const port = await getPort({ host: "::1" });
      expect(port).not.toBe(3000);
    });
  });
});

describe("random port", () => {
  test("{ random: true }", async () => {
    const port = await getPort({ random: true });
    expect(typeof port).toBe("number");
    expect(port).not.toBe(3000);
  });

  test("getRandomPort", async () => {
    const port = await getRandomPort();
    expect(typeof port).toBe("number");
    expect(port).not.toBe(3000);
  });

  test("{ port: 0 }", async () => {
    const port = await getPort({ port: 0 });
    expect(typeof port).toBe("number");
    expect(port).not.toBe(3000);
  });

  test("{ port: '0' }", async () => {
    const port = await getPort({ port: "0" as any });
    expect(typeof port).toBe("number");
    expect(port).not.toBe(3000);
  });
});

describe("errors", () => {
  test("invalid hostname", async () => {
    vi.spyOn(console, "log");
    await getPort({ host: "http://localhost:8080", verbose: true }).catch(
      (error) => error,
    );
    expect(console.log).toHaveBeenCalledWith(
      '[get-port] Invalid hostname: "http://localhost:8080". Using "127.0.0.1" as fallback.',
    );
    vi.resetAllMocks();
  });

  test("invalid hostname (public)", async () => {
    vi.spyOn(console, "log");
    await getPort({
      host: "http://localhost:8080",
      verbose: true,
      public: true,
    }).catch((error) => error);
    expect(console.log).toHaveBeenCalledWith(
      '[get-port] Invalid hostname: "http://localhost:8080". Using "0.0.0.0" as fallback.',
    );
    vi.resetAllMocks();
  });

  test.skipIf(isWindows)("unavailable port", async () => {
    const error = await getPort({
      host: "192.168.1.999",
    }).catch((error) => error);
    expect(error.toString()).toMatchInlineSnapshot(
      `"GetPortError: Unable to find a random port on host "192.168.1.999""`,
    );
  });

  test.skipIf(isWindows)("unavailable port (no random)", async () => {
    const error = await getPort({
      host: "192.168.1.999",
      random: false,
    }).catch((error) => error);
    expect(error.toString()).toMatchInlineSnapshot(
      `"GetPortError: Unable to find an available port on host "192.168.1.999" (tried 3000-3100)"`,
    );
  });
});

describe("internal tools", () => {
  describe("_generateRange", () => {
    test("returns a normal range [from, to) if from < to", () => {
      const from = 1;
      const to = 5;
      const range = _generateRange(from, to);

      expect(range).to.eql([1, 2, 3, 4, 5]);
    });

    test("returns a singleton array if from = to", () => {
      const from = 1;
      const to = 1;
      const range = _generateRange(from, to);

      expect(range).to.eql([1]);
    });

    test("returns an empty array if from > to", () => {
      const from = 5;
      const to = 1;
      const range = _generateRange(from, to);

      expect(range).to.eql([]);
    });
  });
});
