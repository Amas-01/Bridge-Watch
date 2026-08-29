import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import knex, { type Knex } from "knex";

vi.mock("telegraf", () => {
  const mockTelegram = {
    sendMessage: vi.fn().mockResolvedValue({}),
    setWebhook: vi.fn().mockResolvedValue(true),
    getWebhookInfo: vi.fn().mockResolvedValue({ url: "", pending_update_count: 0 }),
    deleteWebhook: vi.fn().mockResolvedValue(true),
    getMe: vi.fn().mockResolvedValue({ username: "test_bot", id: 123456 }),
  };

  class BotMock {
    telegram = mockTelegram;
    use = vi.fn();
    command = vi.fn();
    action = vi.fn();
    stop = vi.fn().mockResolvedValue(true);
    webhookCallback = vi.fn().mockReturnValue(() => {});
  }

  return {
    Telegraf: BotMock,
    Context: class {},
    Markup: {
      inlineKeyboard: vi.fn().mockReturnValue({}),
      button: {
        callback: vi.fn().mockReturnValue({}),
      },
    },
  };
});

vi.mock("../../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    POSTGRES_HOST: process.env.POSTGRES_HOST || "localhost",
    POSTGRES_PORT: Number(process.env.POSTGRES_PORT) || 5432,
    POSTGRES_DB: process.env.POSTGRES_DB || "bridge_watch",
    POSTGRES_USER: process.env.POSTGRES_USER || "bridge_watch",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "bridge_watch_dev",
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "",
    TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    TELEGRAM_WEBHOOK_URL: "",
    TELEGRAM_WEBHOOK_SECRET: "",
    TELEGRAM_BOT_ENABLED: true,
    TELEGRAM_RATE_LIMIT_OUTBOUND_GLOBAL_PER_SEC: 30,
    TELEGRAM_RATE_LIMIT_OUTBOUND_PER_CHAT_PER_SEC: 1,
    TELEGRAM_RATE_LIMIT_INBOUND_COMMANDS_PER_WINDOW: 5,
    TELEGRAM_RATE_LIMIT_INBOUND_WINDOW_SEC: 30,
    TELEGRAM_ADMIN_CHAT_IDS: "",
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { TelegramBotService } from "../../src/services/telegram.bot.service.js";

describe("Telegram bot role authorization (integration)", () => {
  let svc: TelegramBotService;
  let isAdminChat: (chatId: string, userId?: string) => Promise<boolean>;
  let db: Knex;

  const mockRedis = {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockReturnThis(),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(null),
    createClient: vi.fn().mockReturnThis(),
  };

  function commandHandler(name: string) {
    const bot = (svc as any).bot;
    const registration = bot.command.mock.calls.find(
      ([registeredName]: [string]) => registeredName === name,
    );
    return registration ? registration[1] : null;
  }

  beforeAll(async () => {
    const pgHost = process.env.POSTGRES_HOST || "localhost";
    const pgPort = Number(process.env.POSTGRES_PORT) || 5432;
    const pgDb = process.env.POSTGRES_DB || "bridge_watch";
    const pgUser = process.env.POSTGRES_USER || "bridge_watch";
    const pgPass = process.env.POSTGRES_PASSWORD || "bridge_watch_dev";

    db = knex({
      client: "pg",
      connection: {
        host: pgHost,
        port: pgPort,
        database: pgDb,
        user: pgUser,
        password: pgPass,
      },
    });

    // Create admin_accounts table (same schema as migration 016 + 042)
    const hasTable = await db.schema.hasTable("admin_accounts");
    if (!hasTable) {
      await db.schema.createTable("admin_accounts", (table) => {
        table.uuid("id").primary().defaultTo(db.raw("gen_random_uuid()"));
        table.string("address").notNullable().unique();
        table.string("name").notNullable();
        table.string("email").nullable();
        table.jsonb("roles").notNullable().defaultTo("[]");
        table.boolean("is_active").notNullable().defaultTo(true);
        table.string("added_by").notNullable();
        table.timestamp("activated_at").nullable();
        table.timestamp("deactivated_at").nullable();
        table.string("deactivated_by").nullable();
        table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
        table.timestamp("updated_at").notNullable().defaultTo(db.fn.now());
        table.string("telegram_chat_id").nullable().unique();
      });
    }
  });

  afterAll(async () => {
    await db.schema.dropTableIfExists("admin_accounts");
    await db.destroy();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db("admin_accounts").del();
    svc = new TelegramBotService(mockRedis as any);
    isAdminChat = (svc as any).isAdminChat.bind(svc);
  });

  describe("isAdminChat with real database", () => {
    it("rejects chat not found in admin_accounts or bootstrap list", async () => {
      await expect(isAdminChat("999")).resolves.toBe(false);
    });

    it("grants access when admin_accounts row has operator role", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000001",
        address: "GOPERATOR",
        name: "Operator",
        roles: JSON.stringify(["operator"]),
        is_active: true,
        added_by: "GSUPER",
        telegram_chat_id: "111",
      });

      await expect(isAdminChat("111")).resolves.toBe(true);
    });

    it("grants access when admin_accounts row has super_admin role", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000002",
        address: "GSUPER",
        name: "Super Admin",
        roles: JSON.stringify(["super_admin"]),
        is_active: true,
        added_by: "GSUPER",
        telegram_chat_id: "222",
      });

      await expect(isAdminChat("222")).resolves.toBe(true);
    });

    it("rejects access when admin_accounts row has only auditor role", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000003",
        address: "GAUDITOR",
        name: "Auditor",
        roles: JSON.stringify(["auditor"]),
        is_active: true,
        added_by: "GSUPER",
        telegram_chat_id: "333",
      });

      await expect(isAdminChat("333")).resolves.toBe(false);
    });

    it("rejects access when admin_accounts row has only viewer role", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000004",
        address: "GVIEWER",
        name: "Viewer",
        roles: JSON.stringify(["viewer"]),
        is_active: true,
        added_by: "GSUPER",
        telegram_chat_id: "444",
      });

      await expect(isAdminChat("444")).resolves.toBe(false);
    });

    it("rejects access when admin account is inactive", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000005",
        address: "GINACTIVE",
        name: "Inactive Operator",
        roles: JSON.stringify(["operator"]),
        is_active: false,
        added_by: "GSUPER",
        telegram_chat_id: "555",
      });

      await expect(isAdminChat("555")).resolves.toBe(false);
    });

    it("rejects access for non-existent telegram_chat_id", async () => {
      await db("admin_accounts").insert({
        id: "00000000-0000-0000-0000-000000000006",
        address: "GEXISTING",
        name: "Existing",
        roles: JSON.stringify(["operator"]),
        is_active: true,
        added_by: "GSUPER",
        telegram_chat_id: "666",
      });

      await expect(isAdminChat("999")).resolves.toBe(false);
    });

    it("handles multiple admin accounts correctly", async () => {
      await db("admin_accounts").insert([
        {
          id: "00000000-0000-0000-0000-000000000010",
          address: "GSUPER1",
          name: "Super Admin",
          roles: JSON.stringify(["super_admin"]),
          is_active: true,
          added_by: "GSUPER1",
          telegram_chat_id: "101",
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          address: "GAUDITOR1",
          name: "Auditor",
          roles: JSON.stringify(["auditor"]),
          is_active: true,
          added_by: "GSUPER1",
          telegram_chat_id: "102",
        },
        {
          id: "00000000-0000-0000-0000-000000000012",
          address: "GVIEWER1",
          name: "Viewer",
          roles: JSON.stringify(["viewer"]),
          is_active: true,
          added_by: "GSUPER1",
          telegram_chat_id: "103",
        },
      ]);

      await expect(isAdminChat("101")).resolves.toBe(true);
      await expect(isAdminChat("102")).resolves.toBe(false);
      await expect(isAdminChat("103")).resolves.toBe(false);
    });
  });

  describe("admin command handlers reject unauthorized users", () => {
    it("/pause replies Unauthorized for non-admin chat", async () => {
      const handler = commandHandler("pause");
      expect(handler).not.toBeNull();

      const reply = vi.fn();
      await handler({
        chat: { id: 999 },
        from: { id: 1111 },
        message: { text: "/pause" },
        reply,
      });

      expect(reply).toHaveBeenCalledWith("❌ Unauthorized");
    });

    it("/resume replies Unauthorized for non-admin chat", async () => {
      const handler = commandHandler("resume");
      expect(handler).not.toBeNull();

      const reply = vi.fn();
      await handler({
        chat: { id: 999 },
        from: { id: 1111 },
        message: { text: "/resume" },
        reply,
      });

      expect(reply).toHaveBeenCalledWith("❌ Unauthorized");
    });
  });
});
