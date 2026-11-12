import { bootstrapHost, getDriveStatus, HOST_STORE_KEY, type HostAccount } from "./cloud";
import { getKv, setKv } from "./db";

export async function loadHost(): Promise<HostAccount | undefined> {
  return getKv<HostAccount>(HOST_STORE_KEY);
}

export async function saveHost(account: HostAccount): Promise<void> {
  await setKv(HOST_STORE_KEY, account);
}

export async function ensureHost(): Promise<HostAccount> {
  const existing = await loadHost();
  const next = await bootstrapHost(existing ?? null);
  await saveHost(next);
  return next;
}

export async function refreshHostStatus(): Promise<HostAccount> {
  const host = await ensureHost();
  try {
    const status = await getDriveStatus(host.hostSecret);
    const next: HostAccount = {
      ...host,
      googleConnected: status.googleConnected,
      googleEmail: status.googleEmail,
    };
    await saveHost(next);
    return next;
  } catch {
    return host;
  }
}
