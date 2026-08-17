/**
 * The public surface of `@homebase/contracts`.
 *
 * Every export is listed by name on purpose. The domain modules also export
 * shared helpers to each other — `personaManifestAt`, `worldAdventureAt`, the
 * whole validation kernel — and none of those are contracts. Listing the
 * surface explicitly is what keeps an internal helper from quietly becoming
 * something a consumer depends on.
 *
 * Consumers import from here only, never from a module directly.
 */

export {
  ContractValidationError,
  safeParse,
  type ContractErrorCode,
  type ContractValidationResult,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "./primitives.ts";

export {
  OWNERSHIP_TYPES,
  VISIBILITIES,
  type OwnershipType,
  type Visibility,
} from "./vocabulary.ts";

export {
  MOVE_FAMILIES,
  MOVE_REASON_CODES,
  MOVE_SOURCE_TYPES,
  MOVE_STATUSES,
  parseDailyMove,
  parseMoveCompletionOptions,
  type DailyMoveV1,
  type MoveCompletionCategoryV1,
  type MoveCompletionOptionsV1,
  type MoveFamily,
  type MoveReasonCode,
  type MoveSourceType,
  type MoveStatus,
} from "./moves.ts";

export {
  EVENT_SOURCE_TYPES,
  EVENT_TYPES,
  parseGameEvent,
  type EventSourceType,
  type GameEventType,
  type GameEventV1,
} from "./events.ts";

export {
  PROGRESS_DIMENSIONS,
  parseProgressBalance,
  parseProgressSnapshot,
  type ProgressBalanceV1,
  type ProgressDimension,
  type ProgressSnapshotV1,
} from "./progress.ts";

export {
  REWARD_KEYS_V1,
  REWARD_KINDS,
  parseRewardDefinition,
  parseRewardEquipInput,
  parseRewardProgress,
  parseRewardSnapshot,
  type RewardDefinitionV1,
  type RewardEquipInputV1,
  type RewardKeyV1,
  type RewardKind,
  type RewardProgressV1,
  type RewardSnapshotV1,
} from "./rewards.ts";

export {
  PLAN_GOAL_OWNERSHIPS,
  PLAN_GOAL_TRACKING_TYPES,
  PLAN_OWNERS,
  PLAN_TASK_STATUSES,
  parsePlansAction,
  parsePlansSnapshot,
  type PlanGoalOwnership,
  type PlanGoalTrackingType,
  type PlanGoalV1,
  type PlanGroceryV1,
  type PlanOwner,
  type PlanTaskStatus,
  type PlanTaskV1,
  type PlansActionV1,
  type PlansSnapshotV1,
} from "./plans.ts";

export {
  ATTACHMENT_KINDS,
  PERSONA_ACTIVITY_STATES,
  PERSONA_CHARACTERS,
  PERSONA_CREATION_METHODS,
  PERSONA_STATUSES,
  PERSONA_VISIBILITIES,
  REQUIRED_ANIMATIONS,
  SPRITE_ASSET_KINDS,
  parsePersonaAppearance,
  parsePersonaApprovalResult,
  parsePersonaDraftInput,
  parsePersonaManifest,
  parsePersonaProfile,
  parsePersonaSnapshot,
  type AnimationName,
  type AttachmentAnchorV1,
  type AttachmentKind,
  type PersonaActivityState,
  type PersonaAppearanceV1,
  type PersonaApprovalResultV1,
  type PersonaDraftInputV1,
  type PersonaManifestV1,
  type PersonaProfileV1,
  type PersonaSnapshotV1,
  type PersonaStatus,
  type PersonaVisibility,
  type SpriteAnimationV1,
  type SpriteAssetKind,
  type SpriteAssetV1,
  type SpriteFrameV1,
} from "./persona.ts";

export {
  ADVENTURE_STATUSES,
  parseAdventureSnapshot,
  type AdventureSnapshotV1,
  type AdventureStatus,
  type WorldAdventureV1,
} from "./adventures.ts";

export {
  WORLD_ITEM_STATES,
  WORLD_VIEWERS,
  parseWorldProjection,
  type WorldItemState,
  type WorldItemV1,
  type WorldPersonaV1,
  type WorldProjectionV1,
  type WorldViewer,
} from "./world.ts";
