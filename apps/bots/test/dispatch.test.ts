import { describe, expect, it } from "vitest";
import { Bot } from "grammy";
import { installSerialDispatch } from "../src/platform/dispatch";
import type { BotCtx } from "../src/platform/bot";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("serial polling dispatch", () => {
  it("keeps one customer's updates in order while another customer's update proceeds", async () => {
    const bot = new Bot<BotCtx>("123:ABC");
    const started: number[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    bot.handleUpdate = async (update) => {
      const chatId = (update as { message?: { from?: { id?: number } } }).message?.from?.id;
      if (chatId == null) return;
      started.push(chatId);
      if (chatId === 1 && started.filter((id) => id === 1).length === 1) await firstGate;
    };

    const stats = installSerialDispatch(bot);
    void bot.handleUpdate({ update_id: 1, message: { from: { id: 1 } } } as never);
    void bot.handleUpdate({ update_id: 2, message: { from: { id: 1 } } } as never);
    void bot.handleUpdate({ update_id: 3, message: { from: { id: 2 } } } as never);
    await flush();

    expect(started).toEqual(expect.arrayContaining([1, 2]));
    expect(started.filter((id) => id === 1)).toHaveLength(1);
    releaseFirst?.();
    await flush();
    await flush();

    expect(started.filter((id) => id === 1)).toHaveLength(2);
    expect(stats.done).toBe(3);
    expect(stats.queues).toBe(0);
  });
});
