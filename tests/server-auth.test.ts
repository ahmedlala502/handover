import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createPasswordHash,
  createSessionCookie,
  parseSessionCookie,
  verifyPassword,
} from "../src/server/auth";
import {
  buildPostgresPoolConfig,
  createUser,
  deleteUser,
  getVisibleState,
  loadDatabase,
  updateUser,
} from "../src/server/handover-store";

const tempDirs: string[] = [];

async function tempDataFile() {
  const dir = await mkdtemp(join(tmpdir(), "handover-auth-"));
  tempDirs.push(dir);
  return join(dir, "db.json");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("password and session helpers", () => {
  it("verifies scrypt password hashes and rejects the wrong password", async () => {
    const hash = await createPasswordHash("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("round-trips signed session cookies and rejects tampering", () => {
    const secret = "test-secret";
    const cookie = createSessionCookie("u_admin", secret, new Date("2030-01-01T00:00:00.000Z"));

    expect(parseSessionCookie(cookie, secret, new Date("2029-01-01T00:00:00.000Z"))).toEqual({
      userId: "u_admin",
    });

    const [body, signature] = cookie.split(".");
    const tamperedBody = `${body.slice(0, -1)}${body.endsWith("a") ? "b" : "a"}`;
    expect(parseSessionCookie(`${tamperedBody}.${signature}`, secret)).toBeNull();
  });
});

describe("postgres connection config", () => {
  it("strips sslmode from Supabase URLs and disables certificate chain rejection", () => {
    const config = buildPostgresPoolConfig(
      "postgres://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );

    expect(config.connectionString).toBe(
      "postgres://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?supa=base-pooler.x",
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionTimeoutMillis).toBe(8000);
  });
});

describe("handover visibility and admin user management", () => {
  it("filters handovers to records involving the signed-in user", async () => {
    const dataFile = await tempDataFile();
    const db = await loadDatabase(dataFile);
    const regular = db.users.find((user) => user.accessRole === "user");
    const admin = db.users.find((user) => user.accessRole === "admin");

    expect(regular).toBeDefined();
    expect(admin).toBeDefined();

    const visible = getVisibleState(db, regular!.id);
    const adminVisible = getVisibleState(db, admin!.id);

    expect(visible.handovers.length).toBeGreaterThan(0);
    expect(visible.handovers.every((handover) => {
      return (
        handover.createdBy === regular!.id ||
        handover.fromUser === regular!.id ||
        handover.toUser === regular!.id ||
        handover.tasks.some((task) => task.owner === regular!.id) ||
        handover.blockers.some((blocker) => blocker.owner === regular!.id)
      );
    })).toBe(true);
    expect(adminVisible.handovers.length).toBe(db.handovers.length);
  });

  it("allows admins to preview another user's visible handovers", async () => {
    const dataFile = await tempDataFile();
    const db = await loadDatabase(dataFile);
    const regular = db.users.find((user) => user.accessRole === "user")!;
    const admin = db.users.find((user) => user.accessRole === "admin")!;

    const preview = getVisibleState(db, admin.id, regular.id);
    const direct = getVisibleState(db, regular.id);

    expect(preview.activeUserId).toBe(regular.id);
    expect(preview.previewingAsUserId).toBe(regular.id);
    expect(preview.handovers.map((handover) => handover.id)).toEqual(
      direct.handovers.map((handover) => handover.id),
    );
  });

  it("creates, updates, deletes users and changes passwords without exposing hashes", async () => {
    const dataFile = await tempDataFile();
    const db = await loadDatabase(dataFile);
    const admin = db.users.find((user) => user.accessRole === "admin")!;

    const created = await createUser(dataFile, admin.id, {
      username: "new.user",
      password: "first-password",
      name: "New User",
      role: "Coverage Associate",
      accessRole: "user",
      team: "Coverage",
      market: "KSA",
      shift: "PM",
      status: "online",
      email: "new.user@trygc.local",
      phone: "",
      bio: "",
    });

    expect(created.passwordHash).toBeUndefined();

    const afterCreate = await loadDatabase(dataFile);
    const stored = afterCreate.users.find((user) => user.id === created.id)!;
    await expect(verifyPassword("first-password", stored.passwordHash)).resolves.toBe(true);

    const updated = await updateUser(dataFile, admin.id, created.id, {
      accessRole: "admin",
      password: "second-password",
      name: "Updated User",
    });

    expect(updated.accessRole).toBe("admin");
    expect(updated.name).toBe("Updated User");

    const afterUpdate = await loadDatabase(dataFile);
    const updatedStored = afterUpdate.users.find((user) => user.id === created.id)!;
    await expect(verifyPassword("second-password", updatedStored.passwordHash)).resolves.toBe(true);

    await deleteUser(dataFile, admin.id, created.id);
    const afterDelete = await loadDatabase(dataFile);
    expect(afterDelete.users.some((user) => user.id === created.id)).toBe(false);
  });
});
