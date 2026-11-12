import { promises as fs } from "fs";
import path from "path";
import type { AlertLog, ChatSession, Order, StoreData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

const emptyStore = (): StoreData => ({
  chats: {},
  orders: {},
  alerts: [],
});

/**
 * Published hosts are often read-only / ephemeral for the repo `data/` folder.
 * Keep a process-global memory store so chat works; optionally mirror to disk
 * when the filesystem is writable (local `npm run dev`).
 */
type GlobalStore = {
  data: StoreData;
  fileEnabled: boolean | null;
  loaded: boolean;
};

function globalBag(): GlobalStore {
  const g = globalThis as typeof globalThis & { __baStore?: GlobalStore };
  if (!g.__baStore) {
    g.__baStore = { data: emptyStore(), fileEnabled: null, loaded: false };
  }
  return g.__baStore;
}

async function probeFileWritable(): Promise<boolean> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH + ".writetest", "ok", "utf8");
    await fs.unlink(STORE_PATH + ".writetest");
    return true;
  } catch {
    return false;
  }
}

async function ensureLoaded(): Promise<StoreData> {
  const bag = globalBag();
  if (bag.loaded) return bag.data;

  if (bag.fileEnabled === null) {
    bag.fileEnabled = await probeFileWritable();
  }

  if (bag.fileEnabled) {
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as StoreData;
      bag.data = {
        chats: parsed.chats ?? {},
        orders: parsed.orders ?? {},
        alerts: parsed.alerts ?? [],
      };
    } catch {
      bag.data = emptyStore();
      try {
        await fs.writeFile(STORE_PATH, JSON.stringify(bag.data, null, 2), "utf8");
      } catch {
        bag.fileEnabled = false;
      }
    }
  } else {
    bag.data = emptyStore();
  }

  bag.loaded = true;
  return bag.data;
}

async function persist(store: StoreData): Promise<void> {
  const bag = globalBag();
  bag.data = store;
  if (!bag.fileEnabled) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch {
    bag.fileEnabled = false;
  }
}

async function mutate(
  fn: (store: StoreData) => void | Promise<void>
): Promise<StoreData> {
  const store = await ensureLoaded();
  // Shallow clone containers so concurrent reads see consistent snapshots after write
  const next: StoreData = {
    chats: { ...store.chats },
    orders: { ...store.orders },
    alerts: [...store.alerts],
  };
  await fn(next);
  await persist(next);
  return next;
}

export async function getChat(id: string): Promise<ChatSession | null> {
  const store = await ensureLoaded();
  return store.chats[id] ?? null;
}

export async function saveChat(chat: ChatSession): Promise<ChatSession> {
  await mutate((store) => {
    store.chats[chat.id] = chat;
  });
  return chat;
}

export async function getOrder(id: string): Promise<Order | null> {
  const store = await ensureLoaded();
  return store.orders[id] ?? null;
}

export async function getOrderByPaymentId(
  paymentId: string
): Promise<Order | null> {
  const store = await ensureLoaded();
  return (
    Object.values(store.orders).find((o) => o.paymentId === paymentId) ?? null
  );
}

export async function saveOrder(order: Order): Promise<Order> {
  await mutate((store) => {
    store.orders[order.id] = order;
  });
  return order;
}

export async function listOrders(): Promise<Order[]> {
  const store = await ensureLoaded();
  return Object.values(store.orders).sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function listChats(): Promise<ChatSession[]> {
  const store = await ensureLoaded();
  return Object.values(store.chats).sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function appendAlert(alert: AlertLog): Promise<void> {
  await mutate((store) => {
    store.alerts.unshift(alert);
    store.alerts = store.alerts.slice(0, 200);
  });
}

export async function listAlerts(): Promise<AlertLog[]> {
  const store = await ensureLoaded();
  return store.alerts;
}
