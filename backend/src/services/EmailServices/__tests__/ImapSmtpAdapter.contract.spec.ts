import net from "net";
import { createTransport } from "nodemailer";
import {
  EmailSendAmbiguousError,
  EmailSendRejectedError,
  EmailTransientError
} from "../adapters/errors";
import {
  classifySmtpError,
  createSmtpTracker
} from "../adapters/ImapSmtpAdapter";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

// Runs the real nodemailer against a tiny plaintext SMTP server to pin the
// contract the adapter relies on: the transaction log reveals whether DATA was
// sent, and failures map to the right error class. TLS is not under test here.
type Scenario = "ok" | "reject-rcpt" | "drop-after-data" | "stall-after-data";

const startServer = (scenario: Scenario) =>
  new Promise<{ port: number; close: () => void }>(resolve => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer(socket => {
      sockets.add(socket);
      socket.on("error", () => undefined);
      socket.write("220 test ESMTP\r\n");
      let inData = false;
      let buffer = "";
      socket.on("data", chunk => {
        buffer += chunk.toString("latin1");
        let index = buffer.indexOf("\r\n");
        while (index >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          index = buffer.indexOf("\r\n");
          if (inData) {
            if (line === ".") {
              inData = false;
              if (scenario === "stall-after-data") return;
              if (scenario === "drop-after-data") {
                socket.destroy();
                return;
              }
              socket.write("250 queued\r\n");
            }
          } else if (/^EHLO/i.test(line)) {
            socket.write("250 test\r\n");
          } else if (/^MAIL FROM/i.test(line)) {
            socket.write("250 ok\r\n");
          } else if (/^RCPT TO/i.test(line)) {
            socket.write(
              scenario === "reject-rcpt" ? "550 no such user\r\n" : "250 ok\r\n"
            );
          } else if (/^DATA/i.test(line)) {
            socket.write("354 go\r\n");
            inData = true;
          } else if (/^QUIT/i.test(line)) {
            socket.end("221 bye\r\n");
          }
        }
      });
      socket.on("close", () => sockets.delete(socket));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        close: () => {
          sockets.forEach(s => s.destroy());
          server.close();
        }
      });
    });
  });

const attempt = async (port: number, extra: Record<string, unknown> = {}) => {
  const tracker = createSmtpTracker();
  const transport = createTransport({
    host: "127.0.0.1",
    port,
    secure: false,
    ignoreTLS: true,
    logger: tracker.logger,
    transactionLog: true,
    connectionTimeout: 2000,
    greetingTimeout: 2000,
    socketTimeout: 1000,
    ...extra
  });
  try {
    await transport.sendMail({
      from: "a@example.com",
      to: "b@example.com",
      subject: "x",
      text: "corpo"
    });
    return { error: null, tracker };
  } catch (error) {
    return { error, tracker };
  } finally {
    transport.close();
  }
};

describe("SMTP tracker and classifier against real nodemailer", () => {
  it("records that DATA was sent and succeeds on an accepted message", async () => {
    const server = await startServer("ok");
    try {
      const { error, tracker } = await attempt(server.port);
      expect(error).toBeNull();
      expect(tracker.state.dataStarted).toBe(true);
    } finally {
      server.close();
    }
  });

  it("maps a 550 on RCPT to a definitive rejection and DATA never started", async () => {
    const server = await startServer("reject-rcpt");
    try {
      const { error, tracker } = await attempt(server.port);
      expect(tracker.state.dataStarted).toBe(false);
      const mapped = classifySmtpError(error, tracker.state.dataStarted);
      expect(mapped).toBeInstanceOf(EmailSendRejectedError);
      expect((mapped as EmailSendRejectedError).code).toBe(
        "ERR_EMAIL_REJECTED"
      );
      expect((mapped as EmailSendRejectedError).reason).toBe("550");
    } finally {
      server.close();
    }
  });

  it("maps a connection dropped after DATA to ambiguous", async () => {
    const server = await startServer("drop-after-data");
    try {
      const { error, tracker } = await attempt(server.port);
      expect(error).toBeTruthy();
      expect(tracker.state.dataStarted).toBe(true);
      expect(
        classifySmtpError(error, tracker.state.dataStarted)
      ).toBeInstanceOf(EmailSendAmbiguousError);
    } finally {
      server.close();
    }
  });

  it("maps a timeout waiting for the reply to the message body to ambiguous", async () => {
    const server = await startServer("stall-after-data");
    try {
      const { error, tracker } = await attempt(server.port);
      expect(error).toBeTruthy();
      expect(tracker.state.dataStarted).toBe(true);
      expect(
        classifySmtpError(error, tracker.state.dataStarted)
      ).toBeInstanceOf(EmailSendAmbiguousError);
    } finally {
      server.close();
    }
  });

  it("maps a refused connection to transient (nothing was sent)", async () => {
    const probe = await startServer("ok");
    const { port } = probe;
    probe.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    const { error, tracker } = await attempt(port);
    expect(error).toBeTruthy();
    expect(tracker.state.dataStarted).toBe(false);
    expect(classifySmtpError(error, tracker.state.dataStarted)).toBeInstanceOf(
      EmailTransientError
    );
  });
});
