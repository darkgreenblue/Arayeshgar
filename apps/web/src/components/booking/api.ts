"use client";

export type ApiError = { code: string; message: string };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: ApiError };
  if (!res.ok)
    throw Object.assign(new Error(data.error?.message ?? "خطا"), {
      code: data.error?.code ?? "HTTP_" + res.status,
    });
  return data;
}
