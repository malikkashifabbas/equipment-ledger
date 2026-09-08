import { MovementType, ServiceStatus } from '../common/domain';
import { replayTimeline } from './timeline';

const row = (id: string, type: MovementType, hour: number, workerId: string | null = null) => ({ _id: id, type, workerId, effectiveAt: new Date(`2026-09-08T${String(hour).padStart(2, '0')}:00:00Z`), recordedAt: new Date(`2026-09-08T${String(hour).padStart(2, '0')}:01:00Z`) });

describe('ledger timeline', () => {
  it('reconstructs half-open holder state at exact instants', () => {
    const rows = [row('1', MovementType.ISSUE, 9, 'worker-1'), row('2', MovementType.RETURN, 12, 'worker-1')];
    expect(replayTimeline(rows, new Date('2026-09-08T09:00:00Z')).holderId).toBe('worker-1');
    expect(replayTimeline(rows, new Date('2026-09-08T12:00:00Z')).holderId).toBeNull();
  });
  it('rejects a second issue before return', () => {
    expect(() => replayTimeline([row('1', MovementType.ISSUE, 9, 'a'), row('2', MovementType.ISSUE, 10, 'b')])).toThrow('two holders');
  });
  it('applies a correction without erasing the original fact', () => {
    const rows = [row('1', MovementType.ISSUE, 9, 'a'), row('2', MovementType.RETURN, 12, 'a'), { ...row('3', MovementType.CORRECTION, 13), supersedesMovementId: '2', correction: { effectiveAt: new Date('2026-09-08T11:00:00Z') } }];
    expect(replayTimeline(rows, new Date('2026-09-08T11:30:00Z')).holderId).toBeNull();
  });
  it('rejects issue while out of service', () => {
    expect(() => replayTimeline([row('1', MovementType.OUT_OF_SERVICE, 8), row('2', MovementType.ISSUE, 9, 'a')])).toThrow('out-of-service');
    expect(replayTimeline([row('1', MovementType.OUT_OF_SERVICE, 8)]).serviceStatus).toBe(ServiceStatus.OUT_OF_SERVICE);
  });
});
