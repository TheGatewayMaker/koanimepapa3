export async function safeFetch(input: any, init?: any): Promise<any> {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch(input as any, init as any);
  }
  const mod = await import("undici");
  return (mod as any).fetch(input as any, init as any);
}
