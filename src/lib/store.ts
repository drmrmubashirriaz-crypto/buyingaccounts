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

async function readStore(): Promise<StoreData> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    return {
      chats: parsed.chats ?? {},
      orders: parsed.orders ?? {},
      alerts: parsed.alerts ?? [],
    };
  } catch {
    const store = emptyStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
    return store;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function getChat(id: string): Promise<ChatSession | null> {
  const store = await readStore();
  return store.chats[id] ?? null;
}

export async function saveChat(chat: ChatSession): Promise<ChatSession> {
  const store = await readStore();
  store.chats[chat.id] = chat;
  await writeStore(store);
  return chat;
}

export async function getOrder(id: string): Promise<Order | null> {
  const store = await readStore();
  return store.orders[id] ?? null;
}

export async function getOrderByPaymentId(
  paymentId: string
): Promise<Order | null> {
  const store = await readStore();
  return (
    Object.values(store.orders).find((o) => o.paymentId === paymentId) ?? null
  );
}

export async function saveOrder(order: Order): Promise<Order> {
  const store = await readStore();
  store.orders[order.id] = order;
  await writeStore(store);
  return order;
}

export async function listOrders(): Promise<Order[]> {
  const store = await readStore();
  return Object.values(store.orders).sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function listChats(): Promise<ChatSession[]> {
  const store = await readStore();
  return Object.values(store.chats).sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function appendAlert(alert: AlertLog): Promise<void> {
  const store = await readStore();
  store.alerts.unshift(alert);
  store.alerts = store.alerts.slice(0, 200);
  await writeStore(store);
}

export async function listAlerts(): Promise<AlertLog[]> {
  const store = await readStore();
  return store.alerts;
}
