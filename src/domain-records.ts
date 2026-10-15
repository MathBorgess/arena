import type { Actor } from './contracts.js';

interface Entity { id: string; workspace_id: string }
interface Authored { author: Actor; created_at: string }
interface Provenance { source_ids: string[]; redacted?: boolean }
export type DimensionText = Record<string, string>;
export type Dependencies = Record<string, string[]>;
export type VoiceContent = Record<string, string | string[]>;
type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'deferred' | 'superseded';

export interface Exploration extends Entity, Authored { title: string; objective: string }
export interface Branch extends Entity {
  exploration_id: string; name: string; origin_branch_id: string | null; origin_revision_id: string | null;
  current_revision_id: string; profile_revision_id: string | null; vary_dimensions?: string[];
}
export interface Artifact extends Provenance {
  content: string; dependencies: string[] | null; needs_review: boolean; input_revision_id: string;
  author: Actor; session_id?: string; reviewed_by?: Actor;
}
export interface Revision extends Entity, Authored {
  branch_id: string; parent_revision_id: string | null; fields: DimensionText; locks: DimensionText;
  artifacts: Record<string, Artifact>; profile_revision_id: string | null; reason?: string;
}
export interface Proposal extends Entity, Authored, Provenance {
  branch_id: string; base_revision_id: string; version: number; status: ProposalStatus;
  changes: DimensionText; dependencies: Dependencies; rationale: string; warnings: string[];
  origin_proposal_id: string | null; session_id?: string;
}
/** Provider/client/external_session_id are unverified free-text declarations, never Arena IDs. */
export interface Session extends Entity, Authored, Provenance {
  branch_id: string; provider: string; client_name: string; client_version?: string; external_session_id: string | null;
  input_revision_id: string; proposal_ids: string[]; verification: 'declared';
}
export interface Source extends Entity {
  revision: number; status: 'active' | 'revoked' | 'removed'; content: string;
  origin: string; author: string | null; date: string | null; rights: string; usage_scope: string; coverage: string;
  imported_by: Actor; changed_by?: Actor; created_at: string;
}
export interface Feedback extends Entity, Authored, Provenance {
  branch_id: string; target_id: string; revision_id: string; text: string; type: 'critique' | 'question' | 'comment';
}
export interface Decision extends Entity, Authored, Provenance {
  branch_id: string; proposal_id: string; presented_proposal_id: string; presented_version: number;
  decision: Exclude<ProposalStatus, 'pending'>; base_revision_id: string; examined_revision_id: string;
  revision_id: string | null; selected_dimensions: string[]; comment: string;
}
export interface Profile extends Entity, Provenance { name: string; current_revision_id: string }
export interface ProfileRevision extends Entity, Authored, Provenance {
  profile_id: string; version: number; content: VoiceContent;
}
export interface ProfileProposal extends Entity, Authored, Provenance {
  profile_id: string; profile_revision_id: string; base_revision_id: string; version: number;
  status: ProposalStatus; changes: VoiceContent; rationale: string;
}
export interface ProfileDecision extends Entity, Authored, Provenance {
  profile_id: string; proposal_id: string; presented_version: number; decision: 'accepted';
  profile_revision_id: string; comment: string;
}
export interface PassageSelection { start: number; end: number; text: string }
export interface ProductionDna extends Entity, Authored, Provenance {
  branch_id: string; version: number; text: string; previous_id: string | null;
}
export interface ArtifactEvent extends Entity, Authored, Provenance {
  event_id: string; artifact_id: string; branch_id: string; revision_id: string; type: string; operation: string;
  dimension?: string; selection?: PassageSelection | null; proposal_id?: string; presented_version?: number;
  comment?: string; ui_origin?: 'unverified' | 'authenticated_human_channel'; session_id?: string | null;
  patch?: { start: number; end: number; text: string }; before_artifact_id?: string;
  surface?: 'text' | 'dna'; dna_id?: string; dna_version?: number;
  references?: Record<string, string | number>; human_decision?: string | null;
}
export interface EventCheckpoint extends Entity {
  branch_id: string; actor_id: string; after_event_id: string | null;
}
export interface Adapter extends Entity {
  provider: 'codex' | 'chatgpt'; revision: number; account: string | null; state: string; capabilities: string[];
  scopes: string[]; last_verified: string | null; verifications: Record<string, { evidence: string; author: Actor; created_at: string }>;
  evidence_type: 'owner_attestation'; limitations: string[]; pagination: string; costs: string; unavailable_reason: string | null;
}
// Snapshots contain heterogeneous transport projections. Core records above retain their own shapes.
export interface Snapshot extends Entity { actor_id: string; scope: string; payload: Record<string, unknown>; created_at: string }
export interface RecordRegistry {
  exploration: Exploration; branch: Branch; revision: Revision; proposal: Proposal; source: Source; session: Session;
  feedback: Feedback; decision: Decision; profile: Profile; profile_revision: ProfileRevision;
  profile_proposal: ProfileProposal; profile_decision: ProfileDecision; event: ArtifactEvent;
  event_checkpoint: EventCheckpoint; adapter: Adapter; snapshot: Snapshot; production_dna: ProductionDna;
}
export type RecordType = keyof RecordRegistry;
