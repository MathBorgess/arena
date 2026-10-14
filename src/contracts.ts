/** Shared transport contract. Identity always comes from authentication. */
export type Actor = { id: string; kind: 'human' | 'agent' };
export type Dimension = 'niche' | 'audience' | 'theme' | 'thesis' | 'angle' | 'structure' | 'text';
export const dimensions: Dimension[] = ['niche', 'audience', 'theme', 'thesis', 'angle', 'structure', 'text'];
export const agentOperations = [
  'arena.list_work', 'arena.read_context', 'arena.read_source', 'arena.create_exploration',
  'arena.create_branch', 'arena.submit_proposal', 'arena.add_feedback', 'arena.compare_branches',
  'arena.propose_profile_change', 'arena.export_context', 'arena.get_operation', 'arena.list_profiles'
] as const;
export const humanOperations = [
  'human.decide_proposal', 'human.edit_branch', 'human.set_locks', 'human.create_profile',
  'human.approve_profile', 'human.import_sources', 'human.revoke_source', 'human.remove_source',
  'human.invite_member', 'human.revoke_member', 'human.integration_status', 'human.record_verification',
  'human.list_sources', 'human.review_artifacts', 'human.export_text'
] as const;
export type Operation = typeof agentOperations[number] | typeof humanOperations[number];
export type ErrorCode = 'INVALID_INPUT' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'REVISION_CONFLICT' |
  'LOCK_VIOLATION' | 'STALE_DEPENDENCY' | 'CAPABILITY_UNAVAILABLE' | 'SOURCE_UNAVAILABLE' |
  'RATE_LIMITED' | 'IDEMPOTENCY_CONFLICT';
export class ArenaError extends Error {
  constructor(public code: ErrorCode, message: string, public references: Record<string, unknown> = {},
    public retryable = false, public next_step = 'Revise os argumentos e tente novamente.') {
    super(message); this.name = 'ArenaError';
  }
  toJSON() { return { code: this.code, message: this.message, retryable: this.retryable,
    references: this.references, next_step: this.next_step }; }
}
export interface ArenaService {
  authenticate(token: string): Actor;
  execute(operation: string, actor: Actor, input: Record<string, any>): any;
  close(): void;
}
export type BootstrapResult = { workspace_id: string; owner: Actor; owner_token: string; agent: Actor; agent_token: string };
