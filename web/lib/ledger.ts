export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
export type ServiceStatus = 'IN_SERVICE' | 'OUT_OF_SERVICE';
export type Asset = {
  _id: string;
  code: string;
  name: string;
  kind: string;
  requiredCertification: string | null;
  serviceStatus: ServiceStatus;
  currentHolderId: string | null;
  currentIssueMovementId: string | null;
  currentDueAt: string | null;
};
export type Worker = {
  _id: string;
  employeeCode: string;
  name: string;
  certifications: { type: string; expiresAt: string }[];
};
export type Movement = {
  _id: string;
  assetId: string;
  type:
    | 'ISSUE'
    | 'RETURN'
    | 'CORRECTION'
    | 'OUT_OF_SERVICE'
    | 'BACK_IN_SERVICE';
  workerId: string | null;
  dueAt?: string | null;
  reservationId?: string | null;
  effectiveAt: string;
  recordedAt: string;
  recordedById: string;
  supersedesMovementId: string | null;
  correction?: { effectiveAt?: string; reason: string };
  note?: string;
};
export type Reservation = {
  _id: string;
  assetId: string;
  workerId: string;
  startAt: string;
  endAt: string;
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELLED' | 'MISSED';
  cancellationReason?: string;
  cancelledAt?: string;
  fulfilledAt?: string;
};
export type AsOfRow = {
  asset: Asset;
  state: {
    holderId: string | null;
    dueAt: string | null;
    serviceStatus: ServiceStatus;
  };
};
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: unknown }).message
        : null;
    throw new Error(
      Array.isArray(message)
        ? message.join('. ')
        : typeof message === 'string'
          ? message
          : 'The request could not be completed.',
    );
  }
  return body as T;
}
export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export const toLocalInput = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
export const toIso = (value: string) => new Date(value).toISOString();
export const newKey = () => crypto.randomUUID();
export const isOverdue = (asset: Asset, at = new Date()) =>
  Boolean(
    asset.currentHolderId &&
    asset.currentDueAt &&
    new Date(asset.currentDueAt) < at,
  );
