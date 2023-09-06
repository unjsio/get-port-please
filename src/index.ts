import { createServer, AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { isSafePort } from "./unsafe-ports";

export { isUnsafePort, isSafePort } from "./unsafe-ports";

export interface GetPortOptions {
  name: string;
  random: boolean;
  port: number;
  ports: number[];
  portRange: [from: number, to: number];
  alternativePortRange: [from: number, to: number];
  host: string;
  verbose?: boolean;
}

export type GetPortInput = Partial<GetPortOptions> | number | string;

export type HostAddress = undefined | string;
export type PortNumber = number;

const HOSTNAME_RE = /^(?!-)[\d.A-Za-z-]{1,63}(?<!-)$/;

function log(...arguments_) {
  // eslint-disable-next-line no-console
  console.log("[get-port]", ...arguments_);
}

export async function getPort(
  _userOptions: GetPortInput = {},
): Promise<PortNumber> {
  if (typeof _userOptions === "number" || typeof _userOptions === "string") {
    _userOptions = { port: Number.parseInt(_userOptions + "") || 0 };
  }

  const _port = Number(_userOptions.port ?? process.env.PORT ?? 3000);

  const options = {
    name: "default",
    random: _port === 0,
    ports: [],
    portRange: [],
    alternativePortRange: _userOptions.port ? [] : [3000, 3100],
    host: undefined,
    verbose: false,
    ..._userOptions,
    port: _port,
  } as GetPortOptions;

  if (options.host && !HOSTNAME_RE.test(options.host)) {
    throw new Error(`Invalid host: ${JSON.stringify(options.host)}`);
  }

  if (options.random) {
    return getRandomPort(options.host);
  }

  // Ports to check

  const portsToCheck: PortNumber[] = [
    options.port,
    ...options.ports,
    ...generateRange(...options.portRange),
  ].filter((port) => {
    if (!port) {
      return false;
    }
    if (!isSafePort(port)) {
      if (options.verbose) {
        log("Ignoring unsafe port:", port);
      }
      return false;
    }
    return true;
  });

  // Try to find a port
  let availablePort = await findPort(
    portsToCheck,
    options.host,
    options.verbose,
  );

  // Try fallback port range
  if (!availablePort) {
    availablePort = await findPort(
      generateRange(...options.alternativePortRange),
      options.host,
      options.verbose,
    );
    if (options.verbose) {
      log(
        `Unable to find an available port (tried ${
          portsToCheck.join(", ") || "-"
        }). Using alternative port:`,
        availablePort,
      );
    }
  }

  // Try random port
  if (!availablePort && _userOptions.random !== false) {
    availablePort = await getRandomPort(options.host);
    if (availablePort && options.verbose) {
      log(`Using random port ${availablePort}`);
    }
  }

  // Throw error if no port is available
  if (!availablePort) {
    const range = portsToCheck.join("-");
    const alternativeRange = options.alternativePortRange.join("-");
    throw new Error(
      `Unable to find find available port ${fmtHost(
        options.host,
      )} (tried ${range} and ${alternativeRange})`,
    );
  }

  return availablePort;
}

export async function getRandomPort(host?: HostAddress) {
  const port = await checkPort(0, host);
  if (port === false) {
    throw new Error(`Unable to find any random port ${fmtHost(host)}`);
  }
  return port;
}

export interface WaitForPortOptions {
  host?: HostAddress;
  delay?: number;
  retries?: number;
}
export async function waitForPort(
  port: PortNumber,
  options: WaitForPortOptions = {},
) {
  const delay = options.delay || 500;
  const retries = options.retries || 4;
  for (let index = retries; index > 0; index--) {
    if ((await checkPort(port, options.host)) === false) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(
    `Timeout waiting for port ${port} after ${retries} retries with ${delay}ms interval.`,
  );
}

export async function checkPort(
  port: PortNumber,
  host: HostAddress | HostAddress[] = process.env.HOST,
  _verbose?: boolean,
): Promise<PortNumber | false> {
  if (!host) {
    host = getLocalHosts([undefined /* default */, "0.0.0.0"]);
  }
  if (!Array.isArray(host)) {
    return _checkPort(port, host);
  }
  for (const _host of host) {
    const _port = await _checkPort(port, _host);
    if (_port === false) {
      if (port < 1024 && _verbose) {
        log(
          `Unable to listen to the priviliged port ${port} on host ${JSON.stringify(
            _host,
          )}`,
        );
      }
      return false;
    }
    if (port === 0 && _port !== 0) {
      port = _port;
    }
  }
  return port;
}

// ----- Internal -----

function generateRange(from: number, to: number): number[] {
  if (to < from) {
    return [];
  }
  const r = [];
  for (let index = from; index < to; index++) {
    r.push(index);
  }
  return r;
}

function _checkPort(
  port: PortNumber,
  host: HostAddress,
): Promise<PortNumber | false> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on("error", (error: Error & { code: string }) => {
      // Ignore invalid host
      if (error.code === "EINVAL" || error.code === "EADDRNOTAVAIL") {
        resolve(port !== 0 && isSafePort(port) && port);
      } else {
        resolve(false);
      }
    });
    server.listen({ port, host }, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => {
        resolve(isSafePort(port) && port);
      });
    });
  });
}

function getLocalHosts(additional: HostAddress[]): HostAddress[] {
  const hosts = new Set<HostAddress>(additional);
  for (const _interface of Object.values(networkInterfaces())) {
    for (const config of _interface || []) {
      hosts.add(config.address);
    }
  }
  return [...hosts];
}

async function findPort(
  ports: number[],
  host: HostAddress,
  _verbose: boolean,
): Promise<PortNumber> {
  for (const port of ports) {
    const r = await checkPort(port, host, _verbose);
    if (r) {
      return r;
    }
  }
}

function fmtHost(hostname: string | undefined) {
  return hostname ? `on host ${JSON.stringify(hostname)}` : "on any host";
}
