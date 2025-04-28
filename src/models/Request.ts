export type RequestStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface Request {
  id: string;
  orgId: string;
  groupKey?: string;
  payload: any;
  status: RequestStatus;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}
