import dns from "dns";
import net from "net";
import AppError from "../../errors/AppError";

export type MailEndpointKind = "imap" | "smtp";

export type SafeMailEndpoint = {
  address: string;
  servername: string;
  port: number;
};

const ALLOWED_PORTS: Record<MailEndpointKind, number[]> = {
  imap: [993, 143],
  smtp: [465, 587]
};

const HOST_NOT_ALLOWED = "ERR_EMAIL_HOST_NOT_ALLOWED";
const PORT_NOT_ALLOWED = "ERR_EMAIL_PORT_NOT_ALLOWED";

// Exact CIDR checks (never string prefixes) for everything that must not be
// reachable from a user supplied mail host.
const blockedRanges = new net.BlockList();
const blockV4 = (network: string, prefix: number) =>
  blockedRanges.addSubnet(network, prefix, "ipv4");
const blockV6 = (network: string, prefix: number) =>
  blockedRanges.addSubnet(network, prefix, "ipv6");

blockV4("0.0.0.0", 8); // "this network", includes 0.0.0.0
blockV4("10.0.0.0", 8); // private
blockV4("100.64.0.0", 10); // CGNAT
blockV4("127.0.0.0", 8); // loopback
blockV4("169.254.0.0", 16); // link-local (cloud metadata)
blockV4("172.16.0.0", 12); // private
blockV4("192.0.0.0", 24); // IETF protocol assignments
blockV4("192.168.0.0", 16); // private
blockV4("198.18.0.0", 15); // benchmarking
blockV4("224.0.0.0", 4); // multicast
blockV4("240.0.0.0", 4); // reserved + broadcast

blockV6("::", 128); // unspecified
blockV6("::1", 128); // loopback
blockV6("64:ff9b::", 96); // NAT64, embeds an IPv4 address
blockV6("2002::", 16); // 6to4, embeds an IPv4 address
blockV6("fc00::", 7); // unique local
blockV6("fe80::", 10); // link-local
blockV6("fec0::", 10); // deprecated site-local
blockV6("ff00::", 8); // multicast

// IPv4-mapped IPv6 (::ffff:10.0.0.1, ::ffff:127.0.0.1, ::ffff:7f00:1). Kept in
// its own list and only ever queried with IPv6 addresses: net.BlockList treats
// every IPv4 address as mapped when checked against IPv6 rules, so a rule for
// ::ffff:0:0/96 in the main list would block all IPv4 addresses. A resolver
// never legitimately returns a mapped address for a public mail host.
const mappedV4Range = new net.BlockList();
mappedV4Range.addSubnet("::ffff:0:0", 96, "ipv6");

const HOSTNAME_LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

const privateHostsAllowed = (): boolean =>
  process.env.NODE_ENV !== "production" &&
  process.env.EMAIL_ALLOW_PRIVATE_HOSTS === "true";

const hostNotAllowed = () => new AppError(HOST_NOT_ALLOWED, 400);

const normalizeHostname = (host: string, allowPrivate: boolean): string => {
  let name = String(host ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".")) name = name.slice(0, -1);

  if (!name || name.length > 253) throw hostNotAllowed();
  // IP literals (v4, v6, bracketed v6) are never accepted: the host must be a
  // DNS name so it can be validated after resolution and used for TLS SNI.
  if (net.isIP(name) || name.startsWith("[") || name.includes(":")) {
    throw hostNotAllowed();
  }
  // Dotted v4-looking strings that are not valid literals (e.g. "127.1",
  // "0x7f.1") are resolved by inet_aton-style parsers, so refuse all-numeric.
  if (/^[0-9.]+$/.test(name) || /^0x[0-9a-f.]+$/.test(name)) {
    throw hostNotAllowed();
  }

  const labels = name.split(".");
  if (!labels.every(label => HOSTNAME_LABEL.test(label))) {
    throw hostNotAllowed();
  }
  // Dotless names (localhost, intranet) are only valid for the local dev flag.
  if (labels.length < 2 && !allowPrivate) throw hostNotAllowed();

  return name;
};

export const isBlockedMailAddress = (address: string): boolean => {
  const family = net.isIP(address);
  if (family === 0) return true;
  if (family === 4) return blockedRanges.check(address, "ipv4");
  return (
    mappedV4Range.check(address, "ipv6") || blockedRanges.check(address, "ipv6")
  );
};

export const resolveSafeMailEndpoint = async ({
  host,
  port,
  kind
}: {
  host: string;
  port: number;
  kind: MailEndpointKind;
}): Promise<SafeMailEndpoint> => {
  const allowPrivate = privateHostsAllowed();
  const servername = normalizeHostname(host, allowPrivate);

  if (!ALLOWED_PORTS[kind]?.includes(Number(port))) {
    throw new AppError(PORT_NOT_ALLOWED, 400);
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.promises.lookup(servername, { all: true });
  } catch {
    throw hostNotAllowed();
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw hostNotAllowed();
  }

  // Refuse when ANY address is blocked, so a mixed answer cannot be used to
  // reach an internal address.
  if (!allowPrivate && records.some(r => isBlockedMailAddress(r.address))) {
    throw hostNotAllowed();
  }

  // Connect to this IP (not the name) and use servername for TLS/SNI: the
  // validated address is the one used, so DNS rebinding cannot swap it.
  return { address: records[0].address, servername, port: Number(port) };
};
