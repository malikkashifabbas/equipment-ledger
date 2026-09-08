'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  History,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react';
import { AppShell, type View } from '@/components/app-shell';
import { AssetStatus, ReservationStatus } from '@/components/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  api,
  type AsOfRow,
  type Asset,
  type Movement,
  type Reservation,
  type Worker,
  formatDateTime,
  isOverdue,
  newKey,
  toIso,
  toLocalInput,
} from '@/lib/ledger';
import { useLedgerTools } from '@/lib/use-ledger-tools';
type Action = 'issue' | 'return' | 'out-of-service' | 'back-in-service';
export default function Home() {
  const [view, setView] = useState<View>('assets');
  const [assets, setAssets] = useState<Asset[]>([]),
    [workers, setWorkers] = useState<Worker[]>([]),
    [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null),
    [action, setAction] = useState<Action | null>(null),
    [history, setHistory] = useState<Movement[] | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [a, w, r] = await Promise.all([
        api<Asset[]>('/assets'),
        api<Worker[]>('/workers'),
        api<Reservation[]>('/reservations'),
      ]);
      setAssets(a);
      setWorkers(w);
      setReservations(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const workerMap = useMemo(
      () => new Map(workers.map((w) => [w._id, w])),
      [workers],
    ),
    assetMap = useMemo(() => new Map(assets.map((a) => [a._id, a])), [assets]);
  const filtered = assets.filter((a) =>
    `${a.code} ${a.name} ${a.kind}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const counts = {
    available: assets.filter(
      (a) => a.serviceStatus === 'IN_SERVICE' && !a.currentHolderId,
    ).length,
    issued: assets.filter((a) => a.currentHolderId).length,
    overdue: assets.filter((asset) => isOverdue(asset)).length,
    unavailable: assets.filter((a) => a.serviceStatus === 'OUT_OF_SERVICE')
      .length,
    reserved: reservations.filter((r) => r.status === 'ACTIVE').length,
  };
  const showHistory = async (asset: Asset) => {
    setSelected(asset);
    setHistory(null);
    try {
      setHistory(await api<Movement[]>(`/assets/${asset._id}/history`));
    } catch (e) {
      setError((e as Error).message);
      setSelected(null);
    }
  };
  useLedgerTools(refresh);
  return (
    <AppShell view={view} onView={setView} search={search} onSearch={setSearch}>
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertTriangle />
          <AlertTitle>Could not load the ledger</AlertTitle>
          <AlertDescription>
            {error}{' '}
            <Button variant="link" className="h-auto p-0" onClick={refresh}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {view === 'assets' && (
        <>
          <PageTitle
            eyebrow="Live equipment position"
            title="Store overview"
            copy="Issue, return and inspect individual assets from one register."
            action={
              <Button variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={loading ? 'animate-spin' : ''} />
                Refresh ledger
              </Button>
            }
          />
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="Available" value={counts.available} tone="green" />
            <Metric label="Issued" value={counts.issued} tone="blue" />
            <Metric label="Overdue" value={counts.overdue} tone="red" />
            <Metric
              label="Active reservations"
              value={counts.reserved}
              tone="amber"
            />
            <Metric
              label="Out of service"
              value={counts.unavailable}
              tone="red"
            />
          </section>
          <Card>
            <CardHeader className="gap-4 border-b sm:flex-row sm:items-center">
              <div>
                <CardTitle>Equipment register</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {filtered.length} of {assets.length} assets
                </p>
              </div>
              <div className="relative sm:ml-auto sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search code, name or kind"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <LoadingRows />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Asset</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Holder</TableHead>
                      <TableHead>Certification</TableHead>
                      <TableHead className="pr-5 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((asset) => (
                      <TableRow key={asset._id}>
                        <TableCell className="pl-5">
                          <div className="font-semibold">{asset.code}</div>
                          <div className="text-sm text-slate-500">
                            {asset.name}
                          </div>
                        </TableCell>
                        <TableCell>{asset.kind.replaceAll('_', ' ')}</TableCell>
                        <TableCell>
                          <AssetStatus asset={asset} />
                        </TableCell>
                        <TableCell>
                          {asset.currentHolderId ? (
                            <div>
                              <div>
                                {workerMap.get(asset.currentHolderId)?.name ??
                                  'Unknown worker'}
                              </div>
                              {asset.currentDueAt && (
                                <div className="text-xs text-slate-500">
                                  Due {formatDateTime(asset.currentDueAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {asset.requiredCertification ?? (
                            <span className="text-slate-400">None</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-5">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => showHistory(asset)}
                            >
                              <History />
                              History
                            </Button>
                            {asset.currentHolderId ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelected(asset);
                                  setAction('return');
                                }}
                              >
                                <ArrowDownToLine />
                                Return
                              </Button>
                            ) : asset.serviceStatus === 'IN_SERVICE' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Take ${asset.code} out of service`}
                                  onClick={() => {
                                    setSelected(asset);
                                    setAction('out-of-service');
                                  }}
                                >
                                  <Wrench />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelected(asset);
                                    setAction('issue');
                                  }}
                                >
                                  <ArrowUpFromLine />
                                  Issue
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelected(asset);
                                  setAction('back-in-service');
                                }}
                              >
                                <Wrench />
                                Restore
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {view === 'reservations' && (
        <ReservationsView
          assets={assets}
          workers={workers}
          reservations={reservations}
          assetMap={assetMap}
          workerMap={workerMap}
          onChanged={refresh}
        />
      )}{' '}
      {view === 'history' && <AsOfView workers={workers} />}
      <AssetActionDialog
        key={`${selected?._id ?? 'none'}:${action ?? 'none'}`}
        asset={selected}
        action={action}
        workers={workers}
        reservations={reservations}
        onClose={() => {
          setAction(null);
          setSelected(null);
        }}
        onDone={refresh}
      />
      <HistoryDialog
        asset={selected}
        movements={history}
        workers={workerMap}
        onClose={() => {
          setHistory(null);
          setSelected(null);
        }}
        onChanged={async () => {
          if (selected) await showHistory(selected);
          await refresh();
        }}
      />
    </AppShell>
  );
}
function PageTitle({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="mb-1 text-sm font-medium text-[var(--brand-primary)]">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-slate-600">{copy}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green' | 'blue' | 'amber' | 'red';
}) {
  const colors = {
    green:
      'border-[var(--status-available-border)] bg-[var(--status-available-bg)] text-[var(--status-available-text)]',
    blue: 'border-[var(--status-issued-border)] bg-[var(--status-issued-bg)] text-[var(--status-issued-text)]',
    amber:
      'border-[var(--status-reserved-border)] bg-[var(--status-reserved-bg)] text-[var(--status-reserved-text)]',
    red: 'border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-text)]',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm font-medium">{label}</div>
    </div>
  );
}
function LoadingRows() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
function AssetActionDialog({
  asset,
  action,
  workers,
  reservations,
  onClose,
  onDone,
}: {
  asset: Asset | null;
  action: Action | null;
  workers: Worker[];
  reservations: Reservation[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [workerId, setWorkerId] = useState(asset?.currentHolderId ?? ''),
    [keeperId, setKeeperId] = useState(''),
    [effectiveAt, setEffectiveAt] = useState(toLocalInput()),
    [dueAt, setDueAt] = useState(''),
    [note, setNote] = useState(''),
    [damaged, setDamaged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [requestKey] = useState(newKey);
  if (!asset || !action) return null;
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        recordedById: keeperId,
        effectiveAt: toIso(effectiveAt),
        idempotencyKey: requestKey,
        note,
      };
      if (action === 'issue' || action === 'return')
        await api(`/assets/${asset._id}/${action}`, {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            workerId,
            ...(action === 'issue'
              ? {
                  dueAt: toIso(dueAt),
                  reservationId: reservations.find(
                    (reservation) =>
                      reservation.assetId === asset._id &&
                      reservation.workerId === workerId &&
                      reservation.status === 'ACTIVE' &&
                      new Date(reservation.startAt) <= new Date(effectiveAt) &&
                      new Date(reservation.endAt) > new Date(effectiveAt),
                  )?._id,
                }
              : {}),
            ...(action === 'return' ? { damaged } : {}),
          }),
        });
      else
        await api(`/assets/${asset._id}/${action}`, {
          method: 'PATCH',
          body: JSON.stringify({
            recordedById: keeperId,
            effectiveAt: toIso(effectiveAt),
            idempotencyKey: body.idempotencyKey,
            reason: note,
          }),
        });
      await onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const title = {
    issue: 'Issue equipment',
    return: 'Return equipment',
    'out-of-service': 'Take out of service',
    'back-in-service': 'Return to service',
  }[action];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {asset.code} · {asset.name}. Effective time may differ from entry
            time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {(action === 'issue' || action === 'return') && (
            <Field label="Worker">
              <NativeSelect
                className="w-full"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                disabled={action === 'return'}
              >
                <NativeSelectOption value="">Select worker</NativeSelectOption>
                {workers.map((w) => (
                  <NativeSelectOption key={w._id} value={w._id}>
                    {w.name} · {w.employeeCode}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Store keeper">
            <NativeSelect
              className="w-full"
              value={keeperId}
              onChange={(e) => setKeeperId(e.target.value)}
            >
              <NativeSelectOption value="">Select keeper</NativeSelectOption>
              {workers.map((w) => (
                <NativeSelectOption key={w._id} value={w._id}>
                  {w.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Effective date and time">
            <Input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
            />
          </Field>
          {action === 'issue' && (
            <Field label="Due date and time">
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
          )}
          <Field
            label={action.includes('service') ? 'Reason' : 'Note (optional)'}
          >
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Docket, inspection or handover note"
            />
          </Field>
          {action === 'return' && (
            <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <input
                id="returned-damaged"
                type="checkbox"
                checked={damaged}
                onChange={(e) => setDamaged(e.target.checked)}
                className="size-4"
              />
              <label htmlFor="returned-damaged">
                <strong>Returned damaged</strong>
                <br />
                <span className="text-slate-500">
                  Return and take out of service together.
                </span>
              </label>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !keeperId ||
              ((action === 'issue' || action === 'return') && !workerId) ||
              (action === 'issue' && !dueAt)
            }
            onClick={submit}
          >
            {busy ? 'Saving…' : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function HistoryDialog({
  asset,
  movements,
  workers,
  onClose,
  onChanged,
}: {
  asset: Asset | null;
  movements: Movement[] | null;
  workers: Map<string, Worker>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState<Movement | null>(null),
    [effectiveAt, setEffectiveAt] = useState(''),
    [keeperId, setKeeperId] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [requestKey, setRequestKey] = useState(newKey);
  if (!asset || movements === null) return null;
  const correct = async () => {
    if (!correcting) return;
    try {
      await api(`/assets/${asset._id}/corrections`, {
        method: 'POST',
        body: JSON.stringify({
          movementId: correcting._id,
          recordedById: keeperId,
          effectiveAt: toIso(effectiveAt),
          reason,
          idempotencyKey: requestKey,
        }),
      });
      setRequestKey(newKey());
      setCorrecting(null);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{asset.code} movement history</DialogTitle>
          <DialogDescription>
            Facts remain visible; corrections are separate audit entries.
          </DialogDescription>
        </DialogHeader>
        {correcting ? (
          <div className="grid gap-4">
            <Alert>
              <Clock3 />
              <AlertTitle>Correct effective time</AlertTitle>
              <AlertDescription>
                The original {correcting.type.toLowerCase()} remains visible.
              </AlertDescription>
            </Alert>
            <Field label="Correct date and time">
              <Input
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
            </Field>
            <Field label="Store keeper">
              <NativeSelect
                className="w-full"
                value={keeperId}
                onChange={(e) => setKeeperId(e.target.value)}
              >
                <NativeSelectOption value="">Select keeper</NativeSelectOption>
                {[...workers.values()].map((w) => (
                  <NativeSelectOption key={w._id} value={w._id}>
                    {w.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reason">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="mx-0 mb-0">
              <Button variant="outline" onClick={() => setCorrecting(null)}>
                Back
              </Button>
              <Button
                onClick={correct}
                disabled={!effectiveAt || !keeperId || !reason}
              >
                Record correction
              </Button>
            </DialogFooter>
          </div>
        ) : movements.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
            No movements recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {movements.map((m) => (
              <div
                key={m._id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full ${m.type === 'ISSUE' ? 'bg-[var(--status-issued-badge)] text-[var(--status-issued-text)]' : m.type === 'RETURN' ? 'bg-[var(--status-available-badge)] text-[var(--status-available-text)]' : 'bg-[var(--status-reserved-badge)] text-[var(--status-reserved-text)]'}`}
                >
                  {m.type === 'ISSUE' ? (
                    <ArrowUpFromLine className="size-4" />
                  ) : m.type === 'RETURN' ? (
                    <ArrowDownToLine className="size-4" />
                  ) : (
                    <History className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {m.type.replaceAll('_', ' ')}
                  </div>
                  <div className="text-sm text-slate-500">
                    Effective{' '}
                    {formatDateTime(m.correction?.effectiveAt ?? m.effectiveAt)}{' '}
                    · recorded {formatDateTime(m.recordedAt)}
                  </div>
                  {m.workerId && (
                    <div className="text-sm text-slate-600">
                      {workers.get(m.workerId)?.name}
                    </div>
                  )}
                  {m.correction?.reason && (
                    <div className="mt-1 text-sm text-[var(--status-reserved-text)]">
                      {m.correction.reason}
                    </div>
                  )}
                </div>
                {(m.type === 'ISSUE' || m.type === 'RETURN') &&
                  !movements.some((x) => x.supersedesMovementId === m._id) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCorrecting(m);
                        setEffectiveAt(toLocalInput(new Date(m.effectiveAt)));
                      }}
                    >
                      Correct time
                    </Button>
                  )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function ReservationsView({
  assets,
  workers,
  reservations,
  assetMap,
  workerMap,
  onChanged,
}: {
  assets: Asset[];
  workers: Worker[];
  reservations: Reservation[];
  assetMap: Map<string, Asset>;
  workerMap: Map<string, Worker>;
  onChanged: () => Promise<void>;
}) {
  const [assetId, setAssetId] = useState(''),
    [workerId, setWorkerId] = useState(''),
    [startAt, setStartAt] = useState('2026-09-10T09:00'),
    [endAt, setEndAt] = useState('2026-09-10T12:00'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [cancelling, setCancelling] = useState<Reservation | null>(null),
    [cancelKeeperId, setCancelKeeperId] = useState(''),
    [cancelReason, setCancelReason] = useState(''),
    [requestKey, setRequestKey] = useState(newKey);
  const submit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          workerId,
          startAt: toIso(startAt),
          endAt: toIso(endAt),
          idempotencyKey: requestKey,
        }),
      });
      setRequestKey(newKey());
      setMessage('Reservation created.');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancelReservation = async () => {
    if (!cancelling) return;
    setBusy(true);
    setError('');
    try {
      await api(`/reservations/${cancelling._id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({
          recordedById: cancelKeeperId,
          reason: cancelReason,
        }),
      });
      setCancelling(null);
      setCancelKeeperId('');
      setCancelReason('');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="Future allocation"
        title="Reservations"
        copy="Windows are exclusive per asset; adjacent reservations are allowed."
      />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="size-5" />
              New reservation
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Equipment">
              <NativeSelect
                className="w-full"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
              >
                <NativeSelectOption value="">Select asset</NativeSelectOption>
                {assets
                  .filter((a) => a.serviceStatus === 'IN_SERVICE')
                  .map((a) => (
                    <NativeSelectOption key={a._id} value={a._id}>
                      {a.code} · {a.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Worker">
              <NativeSelect
                className="w-full"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
              >
                <NativeSelectOption value="">Select worker</NativeSelectOption>
                {workers.map((w) => (
                  <NativeSelectOption key={w._id} value={w._id}>
                    {w.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="border-[var(--status-available-border)] bg-[var(--status-available-bg)] text-[var(--status-available-text)]">
                <CheckCircle2 />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            <Button
              size="lg"
              onClick={submit}
              disabled={busy || !assetId || !workerId}
            >
              {busy ? 'Checking window…' : 'Reserve equipment'}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reservation register</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Equipment</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="pl-5 font-semibold">
                      {assetMap.get(r.assetId)?.code ?? r.assetId}
                    </TableCell>
                    <TableCell>
                      {workerMap.get(r.workerId)?.name ?? 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <div>{formatDateTime(r.startAt)}</div>
                      <div className="text-slate-500">
                        to {formatDateTime(r.endAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ReservationStatus status={r.status} />
                      {r.cancellationReason && (
                        <div className="mt-1 max-w-52 whitespace-normal text-xs text-slate-500">
                          {r.cancellationReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {r.status === 'ACTIVE' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setError('');
                            setCancelling(r);
                          }}
                        >
                          <XCircle /> Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel reservation</DialogTitle>
            <DialogDescription>
              This keeps the reservation and cancellation reason in the audit
              record.
            </DialogDescription>
          </DialogHeader>
          <Field label="Store keeper">
            <NativeSelect
              className="w-full"
              value={cancelKeeperId}
              onChange={(e) => setCancelKeeperId(e.target.value)}
            >
              <NativeSelectOption value="">Select keeper</NativeSelectOption>
              {workers.map((worker) => (
                <NativeSelectOption key={worker._id} value={worker._id}>
                  {worker.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Cancellation reason">
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>
              Keep reservation
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !cancelKeeperId || !cancelReason}
              onClick={cancelReservation}
            >
              {busy ? 'Cancelling…' : 'Cancel reservation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function AsOfView({ workers }: { workers: Worker[] }) {
  const [at, setAt] = useState(toLocalInput(new Date('2026-09-01T12:00:00Z'))),
    [rows, setRows] = useState<AsOfRow[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const workerMap = new Map(workers.map((w) => [w._id, w]));
  const reconstruct = async () => {
    setBusy(true);
    setError('');
    try {
      setRows(
        await api<AsOfRow[]>(
          `/ledger/as-of?at=${encodeURIComponent(toIso(at))}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="Historical truth"
        title="As-of ledger"
        copy="Reconstruct the full store from effective movements at an exact instant."
      />
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <Field label="Date and time">
            <Input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <Button size="lg" onClick={reconstruct} disabled={busy}>
            <Clock3 />
            {busy ? 'Reconstructing…' : 'Reconstruct ledger'}
          </Button>
          {rows && (
            <div className="text-sm text-slate-500 sm:ml-auto">
              {rows.length} assets at {formatDateTime(toIso(at))}
            </div>
          )}
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {rows && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Asset</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Holder at instant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ asset, state }) => (
                  <TableRow key={asset._id}>
                    <TableCell className="pl-5">
                      <div className="font-semibold">{asset.code}</div>
                      <div className="text-slate-500">{asset.name}</div>
                    </TableCell>
                    <TableCell>
                      <AssetStatus
                        asset={{
                          ...asset,
                          currentHolderId: state.holderId,
                          currentDueAt: state.dueAt,
                          serviceStatus: state.serviceStatus,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {state.holderId ? (
                        (workerMap.get(state.holderId)?.name ?? state.holderId)
                      ) : (
                        <span className="text-slate-400">In store</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 flex-1 gap-1.5">
      <span className="text-sm font-medium leading-none">{label}</span>
      {children}
    </label>
  );
}
