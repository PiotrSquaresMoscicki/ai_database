import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  applySlidingWindow,
  createChatRouter,
  MAX_HISTORY_MESSAGES,
} from "../chat.js";

/** Builds a test app mounting the chat router with a stubbed GenAI client. */
function createTestApp({ sendMessage, capture } = {}) {
  const calls = capture ?? {};
  const fakeClientFactory = () => ({
    chats: {
      create(opts) {
        calls.createOpts = opts;
        return {
          async sendMessage(msg) {
            calls.lastMessage = msg;
            return sendMessage ? sendMessage(msg, opts) : { text: "ok" };
          },
        };
      },
    },
  });
  const app = express();
  app.use(express.json());
  app.use(createChatRouter({ clientFactory: fakeClientFactory }));
  return { app, calls };
}

describe("applySlidingWindow", () => {
  const user = (t) => ({ role: "user", parts: [{ text: t }] });
  const model = (t) => ({ role: "model", parts: [{ text: t }] });

  it("returns an empty array for non-arrays", () => {
    expect(applySlidingWindow(null)).toEqual([]);
    expect(applySlidingWindow(undefined)).toEqual([]);
    expect(applySlidingWindow("not an array")).toEqual([]);
  });

  it("keeps only the most recent N messages", () => {
    const hist = [];
    for (let i = 0; i < 30; i++) {
      hist.push(i % 2 === 0 ? user(`u${i}`) : model(`m${i}`));
    }
    const out = applySlidingWindow(hist, 10);
    expect(out).toHaveLength(10);
    expect(out[0].parts[0].text).toBe("u20");
    expect(out[9].parts[0].text).toBe("m29");
  });

  it("drops leading model turns so the window starts with a user message", () => {
    const out = applySlidingWindow(
      [model("stray"), model("also stray"), user("hi"), model("hey")],
      10,
    );
    expect(out[0].role).toBe("user");
    expect(out).toHaveLength(2);
  });

  it("collapses consecutive same-role turns to keep strict alternation", () => {
    const out = applySlidingWindow(
      [user("a"), user("b"), model("c"), model("d"), user("e")],
      10,
    );
    expect(out.map((m) => m.role)).toEqual(["user", "model", "user"]);
    expect(out[0].parts[0].text).toBe("b");
    expect(out[1].parts[0].text).toBe("d");
  });

  it("filters out malformed messages (unknown role, missing parts)", () => {
    const out = applySlidingWindow(
      [
        { role: "system", parts: [{ text: "no" }] },
        { role: "user", parts: [] },
        user("valid"),
        { role: "model" },
        model("also valid"),
      ],
      10,
    );
    expect(out).toHaveLength(2);
    expect(out[0].parts[0].text).toBe("valid");
    expect(out[1].parts[0].text).toBe("also valid");
  });

  it("returns empty when no user turn exists at all", () => {
    expect(applySlidingWindow([model("a"), model("b")], 10)).toEqual([]);
  });

  it("defaults to MAX_HISTORY_MESSAGES", () => {
    const hist = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? user(`u${i}`) : model(`m${i}`),
    );
    expect(applySlidingWindow(hist)).toHaveLength(MAX_HISTORY_MESSAGES);
  });
});

describe("POST /api/chat", () => {
  it("returns 400 when new_message is missing or empty", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/chat").send({ history: [] });
    expect(res.status).toBe(400);

    const res2 = await request(app)
      .post("/api/chat")
      .send({ history: [], new_message: "   " });
    expect(res2.status).toBe(400);
  });

  it("returns 400 when history is not an array", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post("/api/chat")
      .send({ history: "nope", new_message: "hi" });
    expect(res.status).toBe(400);
  });

  it("forwards new_message and trimmed history, injecting the system instruction", async () => {
    const { app, calls } = createTestApp({
      sendMessage: () => ({ text: "pong" }),
    });

    const history = [];
    for (let i = 0; i < 40; i++) {
      history.push({
        role: i % 2 === 0 ? "user" : "model",
        parts: [{ text: `t${i}` }],
      });
    }

    const res = await request(app)
      .post("/api/chat")
      .send({ history, new_message: "ping" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "pong" });

    // The sliding window must have been applied.
    expect(calls.createOpts.history.length).toBeLessThanOrEqual(
      MAX_HISTORY_MESSAGES,
    );
    // System instruction must be injected by the backend.
    expect(calls.createOpts.config.systemInstruction).toEqual(
      expect.stringContaining("helpful"),
    );
    expect(calls.createOpts.model).toBe("gemini-2.5-flash");
    expect(calls.lastMessage).toEqual({ message: "ping" });
  });

  it("returns 502 and does not leak provider details when the SDK throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = createTestApp({
      sendMessage: () => {
        throw new Error("quota exceeded: super secret detail");
      },
    });

    const res = await request(app)
      .post("/api/chat")
      .send({ history: [], new_message: "hi" });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Upstream chat provider error");
    expect(JSON.stringify(res.body)).not.toMatch(/super secret detail/);
    errSpy.mockRestore();
  });
});
