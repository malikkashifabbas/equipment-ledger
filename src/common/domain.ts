export enum ServiceStatus { IN_SERVICE = 'IN_SERVICE', OUT_OF_SERVICE = 'OUT_OF_SERVICE' }
export enum MovementType { ISSUE = 'ISSUE', RETURN = 'RETURN', CORRECTION = 'CORRECTION', OUT_OF_SERVICE = 'OUT_OF_SERVICE', BACK_IN_SERVICE = 'BACK_IN_SERVICE' }
export enum ReservationStatus { ACTIVE = 'ACTIVE', FULFILLED = 'FULFILLED', CANCELLED = 'CANCELLED', MISSED = 'MISSED' }
export type LedgerState = { holderId: string | null; serviceStatus: ServiceStatus };
