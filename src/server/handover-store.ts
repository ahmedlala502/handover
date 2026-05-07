import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Pool, type PoolConfig } from "pg";

import { createPasswordHash, verifyPassword } from "./auth";

export type AccessRole = "admin" | "user";

export type HandoverUser = {
  id: string;
  username: string;
  passwordHash: string;
  accessRole: AccessRole;
  name: string;
  role: string;
  team: string;
  market: string;
  shift: string;
  status: string;
  email: string;
  phone: string;
  bio: string;
};

export type PublicUser = Omit<HandoverUser, "passwordHash">;

export type HandoverTask = {
  id: string;
  title: string;
  owner: string;
  status: string;
  due: string;
};

export type HandoverBlocker = {
  id: string;
  title: string;
  severity: string;
  owner: string;
  status: string;
  nextAction: string;
};

export type Handover = {
  id: string;
  title: string;
  client: string;
  market: string;
  team: string;
  priority: string;
  status: string;
  type: string;
  shift: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  fromUser: string;
  toUser: string;
  dueAt: string;
  ackAt?: string;
  ackBy?: string;
  closedAt?: string;
  summary: string;
  nextAction: string;
  tasks: HandoverTask[];
  blockers: HandoverBlocker[];
  notes: string;
  links: string;
};

export type Escalation = {
  id: string;
  title: string;
  severity: string;
  market: string;
  team: string;
  owner: string;
  status: string;
  raisedAt: string;
  raisedBy: string;
  nextAction: string;
  sourceHandoverId?: string;
  sourceBlockerId?: string;
  resolvedAt?: string;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  sourceId: string;
};

export type ActivityRecord = {
  id: string;
  icon: string;
  title: string;
  body: string;
  createdAt: string;
  userId: string;
};

export type HandoverDatabase = {
  version: 3;
  users: HandoverUser[];
  teams: string[];
  markets: Array<{ code: string; name: string; ccy: string }>;
  handovers: Handover[];
  escalations: Escalation[];
  notifications: NotificationRecord[];
  activity: ActivityRecord[];
  settings: {
    ackSlaMins: number;
    urgentSlaHrs: number;
    highSlaHrs: number;
    mediumSlaHrs: number;
    lowSlaHrs: number;
    autoEscalateHigh: boolean;
  };
};

export type VisibleState = Omit<HandoverDatabase, "users"> & {
  users: PublicUser[];
  activeUserId: string;
  sessionUserId: string;
  sessionAccessRole: AccessRole;
  previewingAsUserId?: string;
};

export type UserInput = Partial<Omit<PublicUser, "id">> & {
  username?: string;
  password?: string;
};

const TEAMS = [
  "Influencer Ops",
  "Account Management",
  "Community",
  "Coordination",
  "WhatsApp / Chat",
  "Coverage",
  "Activation",
  "Quality",
  "Systems",
  "Finance",
  "PMO",
  "Client Success",
  "AI Enablement",
];

const MARKETS = [
  { code: "KSA", name: "Saudi Arabia", ccy: "SAR" },
  { code: "KW", name: "Kuwait", ccy: "KWD" },
  { code: "UAE", name: "UAE", ccy: "AED" },
  { code: "EG", name: "Egypt", ccy: "EGP" },
  { code: "QA", name: "Qatar", ccy: "QAR" },
  { code: "BH", name: "Bahrain", ccy: "BHD" },
  { code: "OM", name: "Oman", ccy: "OMR" },
];

let postgresPool: Pool | null = null;

export function defaultDataFile() {
  return process.env.HANDOVER_DATA_FILE || join(process.cwd(), ".data", "handover-db.json");
}

export async function loadDatabase(dataFile = defaultDataFile()): Promise<HandoverDatabase> {
  try {
    const raw = await readFile(dataFile, "utf8");
    return normalizeDatabase(JSON.parse(raw) as HandoverDatabase);
  } catch {
    const seeded = await seedDatabase();
    await saveDatabase(seeded, dataFile);
    return seeded;
  }
}

export async function saveDatabase(db: HandoverDatabase, dataFile = defaultDataFile()) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(normalizeDatabase(db), null, 2)}\n`, "utf8");
}

export async function loadRuntimeDatabase() {
  if (shouldUsePostgres()) {
    return loadPostgresDatabase();
  }

  return loadDatabase();
}

export async function saveRuntimeDatabase(db: HandoverDatabase) {
  if (shouldUsePostgres()) {
    await savePostgresDatabase(db);
    return;
  }

  await saveDatabase(db);
}

export async function authenticateRuntimeUser(username: string, password: string) {
  const db = await loadRuntimeDatabase();
  const user = db.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return publicUser(user);
}

export async function authenticateUser(username: string, password: string, dataFile = defaultDataFile()) {
  const db = await loadDatabase(dataFile);
  const user = db.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return publicUser(user);
}

export function getVisibleState(
  db: HandoverDatabase,
  sessionUserId: string,
  previewUserId?: string,
): VisibleState {
  const sessionUser = requireUser(db, sessionUserId);
  const activeUser =
    sessionUser.accessRole === "admin" && previewUserId
      ? requireUser(db, previewUserId)
      : sessionUser;
  const canSeeAll = sessionUser.accessRole === "admin" && !previewUserId;
  const handovers = canSeeAll
    ? db.handovers
    : db.handovers.filter((handover) => userCanSeeHandover(handover, activeUser.id));
  const handoverIds = new Set(handovers.map((handover) => handover.id));
  const escalations = canSeeAll
    ? db.escalations
    : db.escalations.filter((escalation) => {
        return escalation.owner === activeUser.id || escalation.raisedBy === activeUser.id ||
          (escalation.sourceHandoverId ? handoverIds.has(escalation.sourceHandoverId) : false);
      });

  return {
    version: db.version,
    users: db.users.map(publicUser),
    teams: db.teams,
    markets: db.markets,
    handovers,
    escalations,
    notifications: db.notifications.filter((notification) => {
      return canSeeAll || notification.userId === activeUser.id;
    }),
    activity: canSeeAll
      ? db.activity
      : db.activity.filter((activity) => activity.userId === activeUser.id),
    settings: db.settings,
    activeUserId: activeUser.id,
    sessionUserId: sessionUser.id,
    sessionAccessRole: sessionUser.accessRole,
    ...(activeUser.id !== sessionUser.id ? { previewingAsUserId: activeUser.id } : {}),
  };
}

export async function mergeVisibleState(
  dataFile: string,
  sessionUserId: string,
  incoming: VisibleState,
  previewUserId?: string,
) {
  const db = await loadDatabase(dataFile);
  const next = mergeStateIntoDatabase(db, sessionUserId, incoming, previewUserId);
  await saveDatabase(db, dataFile);
  return next;
}

export async function mergeRuntimeVisibleState(
  sessionUserId: string,
  incoming: VisibleState,
  previewUserId?: string,
) {
  const db = await loadRuntimeDatabase();
  const next = mergeStateIntoDatabase(db, sessionUserId, incoming, previewUserId);
  await saveRuntimeDatabase(db);
  return next;
}

function mergeStateIntoDatabase(
  db: HandoverDatabase,
  sessionUserId: string,
  incoming: VisibleState,
  previewUserId?: string,
) {
  const sessionUser = requireUser(db, sessionUserId);

  if (sessionUser.accessRole === "admin" && !previewUserId) {
    db.teams = incoming.teams;
    db.markets = incoming.markets;
    db.settings = incoming.settings;
    db.handovers = incoming.handovers.map(normalizeHandover);
    db.escalations = incoming.escalations;
    db.notifications = incoming.notifications;
    db.activity = incoming.activity;
    return getVisibleState(db, sessionUserId);
  }

  const activeUserId = sessionUser.accessRole === "admin" && previewUserId ? previewUserId : sessionUserId;
  const visibleIds = new Set(
    db.handovers.filter((handover) => userCanSeeHandover(handover, activeUserId)).map((handover) => handover.id),
  );
  const nextVisible = incoming.handovers.map((handover) => {
    const normalized = normalizeHandover(handover);
    const isExisting = visibleIds.has(normalized.id);

    if (!isExisting) {
      normalized.createdBy = activeUserId;
      normalized.fromUser = activeUserId;
    }

    return normalized;
  });
  const nextIds = new Set(nextVisible.map((handover) => handover.id));
  db.handovers = db.handovers
    .filter((handover) => !visibleIds.has(handover.id) || !nextIds.has(handover.id))
    .concat(nextVisible);
  db.notifications = db.notifications
    .filter((notification) => notification.userId !== activeUserId)
    .concat(incoming.notifications.filter((notification) => notification.userId === activeUserId));
  db.activity = incoming.activity.concat(
    db.activity.filter((activity) => activity.userId !== activeUserId),
  ).slice(0, 120);

  return getVisibleState(db, sessionUserId, previewUserId);
}

export async function createUser(dataFile: string, adminUserId: string, input: UserInput) {
  const db = await loadDatabase(dataFile);
  requireAdmin(db, adminUserId);

  const username = requireString(input.username, "Username");
  if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Username already exists.");
  }

  const user: HandoverUser = {
    id: uid("u"),
    username,
    passwordHash: await createPasswordHash(requireString(input.password, "Password")),
    accessRole: input.accessRole === "admin" ? "admin" : "user",
    name: requireString(input.name, "Name"),
    role: input.role || "",
    team: input.team || db.teams[0],
    market: input.market || db.markets[0].code,
    shift: input.shift || "AM",
    status: input.status || "online",
    email: input.email || "",
    phone: input.phone || "",
    bio: input.bio || "",
  };
  db.users.push(user);
  await saveDatabase(db, dataFile);

  return publicUser(user);
}

export async function createRuntimeUser(adminUserId: string, input: UserInput) {
  const db = await loadRuntimeDatabase();
  requireAdmin(db, adminUserId);
  const username = requireString(input.username, "Username");
  if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Username already exists.");
  }

  const user: HandoverUser = {
    id: uid("u"),
    username,
    passwordHash: await createPasswordHash(requireString(input.password, "Password")),
    accessRole: input.accessRole === "admin" ? "admin" : "user",
    name: requireString(input.name, "Name"),
    role: input.role || "",
    team: input.team || db.teams[0],
    market: input.market || db.markets[0].code,
    shift: input.shift || "AM",
    status: input.status || "online",
    email: input.email || "",
    phone: input.phone || "",
    bio: input.bio || "",
  };
  db.users.push(user);
  await saveRuntimeDatabase(db);

  return publicUser(user);
}

export async function updateUser(dataFile: string, adminUserId: string, userId: string, input: UserInput) {
  const db = await loadDatabase(dataFile);
  requireAdmin(db, adminUserId);
  const user = requireUser(db, userId);

  if (input.username && input.username !== user.username) {
    if (db.users.some((candidate) => candidate.id !== userId && candidate.username.toLowerCase() === input.username!.toLowerCase())) {
      throw new Error("Username already exists.");
    }
    user.username = input.username;
  }

  if (input.password) {
    user.passwordHash = await createPasswordHash(input.password);
  }

  user.accessRole = input.accessRole === "admin" ? "admin" : "user";
  user.name = input.name ?? user.name;
  user.role = input.role ?? user.role;
  user.team = input.team ?? user.team;
  user.market = input.market ?? user.market;
  user.shift = input.shift ?? user.shift;
  user.status = input.status ?? user.status;
  user.email = input.email ?? user.email;
  user.phone = input.phone ?? user.phone;
  user.bio = input.bio ?? user.bio;
  preventNoAdmins(db);
  await saveDatabase(db, dataFile);

  return publicUser(user);
}

export async function updateRuntimeUser(adminUserId: string, userId: string, input: UserInput) {
  const db = await loadRuntimeDatabase();
  requireAdmin(db, adminUserId);
  const user = requireUser(db, userId);

  await applyUserUpdate(db, user, userId, input);
  await saveRuntimeDatabase(db);

  return publicUser(user);
}

export async function deleteUser(dataFile: string, adminUserId: string, userId: string) {
  const db = await loadDatabase(dataFile);
  requireAdmin(db, adminUserId);
  if (adminUserId === userId) {
    throw new Error("You cannot delete your own admin account.");
  }

  db.users = db.users.filter((user) => user.id !== userId);
  preventNoAdmins(db);
  await saveDatabase(db, dataFile);
}

export async function deleteRuntimeUser(adminUserId: string, userId: string) {
  const db = await loadRuntimeDatabase();
  requireAdmin(db, adminUserId);
  if (adminUserId === userId) {
    throw new Error("You cannot delete your own admin account.");
  }

  db.users = db.users.filter((user) => user.id !== userId);
  preventNoAdmins(db);
  await saveRuntimeDatabase(db);
}

export function publicUser(user: HandoverUser): PublicUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function userCanSeeHandover(handover: Handover, userId: string) {
  return (
    handover.createdBy === userId ||
    handover.fromUser === userId ||
    handover.toUser === userId ||
    handover.tasks.some((task) => task.owner === userId) ||
    handover.blockers.some((blocker) => blocker.owner === userId)
  );
}

function requireAdmin(db: HandoverDatabase, userId: string) {
  const user = requireUser(db, userId);
  if (user.accessRole !== "admin") {
    throw new Error("Admin access required.");
  }
  return user;
}

function requireUser(db: HandoverDatabase, userId: string) {
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error("User not found.");
  }
  return user;
}

function preventNoAdmins(db: HandoverDatabase) {
  if (!db.users.some((user) => user.accessRole === "admin")) {
    throw new Error("At least one admin user is required.");
  }
}

async function applyUserUpdate(
  db: HandoverDatabase,
  user: HandoverUser,
  userId: string,
  input: UserInput,
) {
  if (input.username && input.username !== user.username) {
    if (db.users.some((candidate) => candidate.id !== userId && candidate.username.toLowerCase() === input.username!.toLowerCase())) {
      throw new Error("Username already exists.");
    }
    user.username = input.username;
  }

  if (input.password) {
    user.passwordHash = await createPasswordHash(input.password);
  }

  user.accessRole = input.accessRole === "admin" ? "admin" : "user";
  user.name = input.name ?? user.name;
  user.role = input.role ?? user.role;
  user.team = input.team ?? user.team;
  user.market = input.market ?? user.market;
  user.shift = input.shift ?? user.shift;
  user.status = input.status ?? user.status;
  user.email = input.email ?? user.email;
  user.phone = input.phone ?? user.phone;
  user.bio = input.bio ?? user.bio;
  preventNoAdmins(db);
}

function requireString(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function normalizeDatabase(db: HandoverDatabase): HandoverDatabase {
  return {
    version: 3,
    users: db.users.map((user) => ({
      ...user,
      username: user.username || user.email || user.id,
      accessRole: user.accessRole === "admin" ? "admin" : "user",
      passwordHash: user.passwordHash,
    })),
    teams: Array.isArray(db.teams) && db.teams.length ? db.teams : TEAMS,
    markets: Array.isArray(db.markets) && db.markets.length ? db.markets : MARKETS,
    handovers: Array.isArray(db.handovers) ? db.handovers.map(normalizeHandover) : [],
    escalations: Array.isArray(db.escalations) ? db.escalations : [],
    notifications: Array.isArray(db.notifications) ? db.notifications : [],
    activity: Array.isArray(db.activity) ? db.activity : [],
    settings: {
      ackSlaMins: db.settings?.ackSlaMins || 30,
      urgentSlaHrs: db.settings?.urgentSlaHrs || 2,
      highSlaHrs: db.settings?.highSlaHrs || 8,
      mediumSlaHrs: db.settings?.mediumSlaHrs || 24,
      lowSlaHrs: db.settings?.lowSlaHrs || 48,
      autoEscalateHigh: db.settings?.autoEscalateHigh ?? true,
    },
  };
}

function normalizeHandover(handover: Handover): Handover {
  return {
    ...handover,
    tasks: Array.isArray(handover.tasks) ? handover.tasks : [],
    blockers: Array.isArray(handover.blockers) ? handover.blockers : [],
  };
}

async function seedDatabase(): Promise<HandoverDatabase> {
  const now = new Date();
  const users: HandoverUser[] = [
    {
      id: "u_ahmed",
      username: process.env.HANDOVER_ADMIN_USER || "admin",
      passwordHash: await createPasswordHash(process.env.HANDOVER_ADMIN_PASSWORD || "change-me"),
      accessRole: "admin",
      name: "Ahmed Essmat",
      role: "Head of Regional Operations",
      team: "PMO",
      market: "EG",
      shift: "Leadership",
      status: "online",
      email: "ahmed@trygc.local",
      phone: "",
      bio: "Owns regional governance, handover quality, escalations, and execution rhythm.",
    },
    {
      id: "u_coord_ksa",
      username: "mona",
      passwordHash: await createPasswordHash("change-me"),
      accessRole: "user",
      name: "Mona Saleh",
      role: "Coordination Lead",
      team: "Coordination",
      market: "KSA",
      shift: "AM",
      status: "online",
      email: "mona@trygc.local",
      phone: "",
      bio: "Campaign setup, tracking sheets, owners, and final reports.",
    },
    {
      id: "u_chat_ksa",
      username: "omar",
      passwordHash: await createPasswordHash("change-me"),
      accessRole: "user",
      name: "Omar Khaled",
      role: "WhatsApp Lead",
      team: "WhatsApp / Chat",
      market: "KSA",
      shift: "PM",
      status: "away",
      email: "omar@trygc.local",
      phone: "",
      bio: "Influencer invitations, reminders, briefing flow, and reply accuracy.",
    },
    {
      id: "u_cov_kw",
      username: "reem",
      passwordHash: await createPasswordHash("change-me"),
      accessRole: "user",
      name: "Reem Al-Sabah",
      role: "Coverage Senior",
      team: "Coverage",
      market: "KW",
      shift: "Night",
      status: "focus",
      email: "reem@trygc.local",
      phone: "",
      bio: "Proof collection, missing coverage aging, and post reconciliation.",
    },
  ];
  const handovers: Handover[] = [
    {
      id: uid("ho"),
      title: "Starbucks Mr Beast - missing coverage push",
      client: "Starbucks",
      market: "KSA",
      team: "Coverage",
      priority: "urgent",
      status: "submitted",
      type: "Shift-to-shift",
      shift: "PM to Night",
      createdAt: new Date(now.getTime() - 1000 * 60 * 55).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 60 * 18).toISOString(),
      createdBy: "u_ahmed",
      fromUser: "u_chat_ksa",
      toUser: "u_cov_kw",
      dueAt: new Date(now.getTime() + 1000 * 60 * 90).toISOString(),
      summary: "Actual visits are confirmed, but coverage gap is still aging.",
      nextAction: "Send final reminder batch and reconcile QR logs vs posted proofs.",
      tasks: [
        { id: uid("task"), title: "Push Post-or-Pay warning to missing coverage creators", owner: "u_cov_kw", status: "in-progress", due: today() },
      ],
      blockers: [
        { id: uid("blk"), title: "341 creators visited but did not post yet", severity: "High", owner: "u_cov_kw", status: "open", nextAction: "Escalate to AM if no movement." },
      ],
      notes: "Focus on influencers with visits older than 48h first.",
      links: "Coverage tracker / QR logs",
    },
    {
      id: uid("ho"),
      title: "Honey Butter launch - influencer confirmations",
      client: "Honey Butter",
      market: "KSA",
      team: "WhatsApp / Chat",
      priority: "high",
      status: "acknowledged",
      type: "Cross-team",
      shift: "AM to PM",
      createdAt: new Date(now.getTime() - 1000 * 60 * 180).toISOString(),
      updatedAt: new Date(now.getTime() - 1000 * 60 * 80).toISOString(),
      createdBy: "u_coord_ksa",
      fromUser: "u_coord_ksa",
      toUser: "u_chat_ksa",
      dueAt: new Date(now.getTime() + 1000 * 60 * 60 * 5).toISOString(),
      ackAt: new Date(now.getTime() - 1000 * 60 * 75).toISOString(),
      ackBy: "u_chat_ksa",
      summary: "List is ready. WhatsApp team should continue confirmation flow.",
      nextAction: "Complete Reminder 1 and pass no-response list to Community.",
      tasks: [
        { id: uid("task"), title: "Send Reminder 1 to pending list", owner: "u_chat_ksa", status: "pending", due: today() },
      ],
      blockers: [],
      notes: "Client prefers weekend visit slots.",
      links: "",
    },
  ];

  return {
    version: 3,
    users,
    teams: TEAMS,
    markets: MARKETS,
    handovers,
    escalations: [
      {
        id: uid("esc"),
        title: "Starbucks: 341 missing coverage after actual visits",
        severity: "High",
        market: "KSA",
        team: "Coverage",
        owner: "u_cov_kw",
        status: "open",
        raisedAt: new Date(now.getTime() - 1000 * 60 * 55).toISOString(),
        raisedBy: "u_chat_ksa",
        nextAction: "Final push plus AM escalation if no proof.",
        sourceHandoverId: handovers[0].id,
      },
    ],
    notifications: [
      {
        id: uid("n"),
        userId: "u_cov_kw",
        type: "handover",
        title: "New urgent handover assigned",
        body: "Starbucks Mr Beast - missing coverage push",
        createdAt: new Date(now.getTime() - 1000 * 60 * 18).toISOString(),
        read: false,
        sourceId: handovers[0].id,
      },
    ],
    activity: [
      {
        id: uid("a"),
        icon: "H",
        title: "Urgent handover created",
        body: "Starbucks Mr Beast moved from WhatsApp to Coverage with a high blocker.",
        createdAt: new Date(now.getTime() - 1000 * 60 * 55).toISOString(),
        userId: "u_chat_ksa",
      },
    ],
    settings: {
      ackSlaMins: 30,
      urgentSlaHrs: 2,
      highSlaHrs: 8,
      mediumSlaHrs: 24,
      lowSlaHrs: 48,
      autoEscalateHigh: true,
    },
  };
}

function shouldUsePostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
}

async function loadPostgresDatabase() {
  await ensurePostgresSchema();
  const result = await getPostgresPool().query<{ data: HandoverDatabase }>(
    "select data from public.handover_app_state where id = $1",
    ["primary"],
  );

  if (result.rowCount) {
    return normalizeDatabase(result.rows[0].data);
  }

  const seeded = await seedDatabase();
  await savePostgresDatabase(seeded);
  return seeded;
}

async function savePostgresDatabase(db: HandoverDatabase) {
  await ensurePostgresSchema();
  await getPostgresPool().query(
    `insert into public.handover_app_state (id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    ["primary", JSON.stringify(normalizeDatabase(db))],
  );
}

async function ensurePostgresSchema() {
  await getPostgresPool().query(`
    create table if not exists public.handover_app_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );
    alter table public.handover_app_state enable row level security;
  `);
}

function getPostgresPool() {
  if (!postgresPool) {
    postgresPool = new Pool(buildPostgresPoolConfig(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL));
  }

  return postgresPool;
}

export function buildPostgresPoolConfig(connectionString: string | undefined): PoolConfig {
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured.");
  }

  return {
    connectionString: stripPgSslParams(connectionString),
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  };
}

function stripPgSslParams(connectionString: string) {
  try {
    const url = new URL(connectionString);
    for (const param of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-5)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
