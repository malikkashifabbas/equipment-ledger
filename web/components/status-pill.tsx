import { Badge } from '@/components/ui/badge';
import { isOverdue, type Asset, type Reservation } from '@/lib/ledger';
const styles = {
  available:
    'border-[var(--status-available-border)] bg-[var(--status-available-badge)] text-[var(--status-available-text)]',
  issued:
    'border-[var(--status-issued-border)] bg-[var(--status-issued-badge)] text-[var(--status-issued-text)]',
  unavailable:
    'border-[var(--status-danger-border)] bg-[var(--status-danger-badge)] text-[var(--status-danger-text)]',
  active:
    'border-[var(--status-reserved-border)] bg-[var(--status-reserved-badge)] text-[var(--status-reserved-text)]',
  muted:
    'border-[var(--brand-border)] bg-[var(--brand-table-head)] text-[var(--brand-text-muted)]',
};
export function AssetStatus({ asset }: { asset: Asset }) {
  const overdue = isOverdue(asset);
  const state =
    asset.serviceStatus === 'OUT_OF_SERVICE'
      ? ['Out of service', styles.unavailable]
      : overdue
        ? ['Overdue', styles.unavailable]
        : asset.currentHolderId
          ? ['Issued', styles.issued]
          : ['Available', styles.available];
  return (
    <Badge variant="outline" className={state[1]}>
      {state[0]}
    </Badge>
  );
}
export function ReservationStatus({
  status,
}: {
  status: Reservation['status'];
}) {
  return (
    <Badge
      variant="outline"
      className={
        status === 'ACTIVE'
          ? styles.active
          : status === 'CANCELLED'
            ? styles.unavailable
            : styles.muted
      }
    >
      {status.toLowerCase()}
    </Badge>
  );
}
