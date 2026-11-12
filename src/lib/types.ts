export type OrderStatus =
  | "unpaid"
  | "awaiting_payment"
  | "paid"
  | "sourcing"
  | "delivered";

export type MessageRole = "buyer" | "bot" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  meta?: {
    kind?: "quote" | "payment_link" | "status" | "email_prompt";
    priceUsd?: number;
    paymentUrl?: string;
    orderId?: string;
  };
}

export interface QuoteDetails {
  platform: string;
  summary: string;
  specs: string[];
  priceUsd: number;
  quantity: number;
}

export interface Order {
  id: string;
  chatId: string;
  status: OrderStatus;
  quote: QuoteDetails;
  paymentId?: string;
  paymentUrl?: string;
  buyerEmail?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  deliveredAt?: string;
  chatSummary: string;
}

export type BotPhase =
  | "greeting"
  | "qualifying"
  | "quoted"
  | "awaiting_payment"
  | "awaiting_email"
  | "sourcing"
  | "delivered"
  | "declined";

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  phase: BotPhase;
  draft: {
    platform?: string;
    specs: string[];
    quantity: number;
    notes?: string;
  };
  quote?: QuoteDetails;
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  chats: Record<string, ChatSession>;
  orders: Record<string, Order>;
  alerts: AlertLog[];
}

export interface AlertLog {
  id: string;
  channel: "telegram" | "email" | "console";
  orderId: string;
  message: string;
  createdAt: string;
  ok: boolean;
}
