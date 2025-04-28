export interface RequestGroup {
  key: string;
  orgId: string;
  cooldownUntil?: Date;
  requests: Set<string>;
}
