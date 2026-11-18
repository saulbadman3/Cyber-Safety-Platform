import { uk } from "./i18n/uk";

const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function cookieValue(name: string): string | null {
  const match = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const csrfExempt = ["/auth/login", "/auth/register", "/loss/calculate"];
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !csrfExempt.includes(path)) {
    let token = cookieValue("csrf_token");
    if (!token) {
      const csrfResponse = await fetch(API_BASE + "/auth/csrf", { credentials: "include" });
      if (csrfResponse.ok) token = (await csrfResponse.json()).csrf_token as string;
    }
    if (token) headers.set("X-CSRF-Token", token);
  }
  const response = await fetch(API_BASE + path, {
    ...init,
    method,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.code || "request_failed",
      body?.error?.message || uk.requestFailed,
    );
  }
  return response.json() as Promise<T>;
}

export type Question = {
  id: number;
  slug: string;
  text: string;
  hint: string;
  position: number;
  weight: number;
  category: { slug: string; title: string };
  recommendation: { slug: string; title: string; description: string };
};
export type Questionnaire = { version: string; categories: { slug: string; title: string; position: number }[]; questions: Question[] };
export type Answer = "yes" | "partial" | "no" | "unknown";
export type Assessment = { id: number; company_name: string; status: "draft" | "completed"; current_question: number; answers: Record<string, Answer> };
export type CategoryScore = { slug: string; title: string; score: number };
export type Result = {
  assessment_id: number;
  total_score: number;
  risk_level: "high" | "medium" | "low";
  risk_label: string;
  risk_color: string;
  categories: CategoryScore[];
  weakest_categories: CategoryScore[];
};
export type LossVariant = { variant: "optimistic" | "base" | "pessimistic"; label: string; av: string; ef: string; aro: string; sle: string; ale: string };
export type LossScenario = { id: number; slug: string; title: string; description: string; assumptions: string; sources: string[]; variants: LossVariant[] };
export type ActionItem = {
  id: number; title: string; description: string; priority: number; priority_label: string;
  status: "todo" | "in_progress" | "done"; status_label: string; cost_min: string; cost_max: string;
  complexity: string; risk_reduction: string; assignee: string; due_date: string | null; lesson_slug: string;
};
export type Lesson = { slug: string; title: string; category: { title: string }; body: string; takeaways: string[]; recommendation_slugs: string[] };
export type QuizCard = { id: number; slug: string; sender: string; subject: string; body: string; category: string };

export function formatMoney(value: string | number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Number(value) || 0) + " " + uk.currency;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(new Date(value));
}
