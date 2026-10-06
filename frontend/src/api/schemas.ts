import { z } from 'zod/mini';

/**
 * Response schemas for every endpoint the UI calls. Responses are parsed at
 * the boundary (api/http.ts), so a server/client drift fails loudly with a
 * readable error instead of leaking `undefined` into the clinical UI.
 * Types are inferred from the schemas — one source for shape and type.
 */

/** One FDA-backed reason why `precipitant` changes `object` (CYP enzyme or transporter). */
export const DirectedLinkSchema = z.object({
  precipitant: z.string(),
  object: z.string(),
  pathway: z.string(),
  effect: z.enum(['inhibits', 'induces']),
  strength: z.string(),
  object_sensitivity: z.string(),
});
export type DirectedLink = z.infer<typeof DirectedLinkSchema>;

/** Precipitant → object from the FDA table; absent on a neighbour = direction unknown. */
export const PairRolesSchema = z.object({
  pattern: z.enum(['directed', 'bidirectional']),
  links: z.array(DirectedLinkSchema),
});
export type PairRoles = z.infer<typeof PairRolesSchema>;

export const SourceSchema = z.object({
  label: z.string(),
  url: z.string(),
  content_date: z.string(),
  retrieved: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const NeighborInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  kind: z.string(),
  direction: z.string(),
  severity: z.string(),
  /** which rule graded the severity: kind:… | default:… | onc:<n> */
  severity_basis: z.optional(z.string()),
  mechanism: z.string(),
  roles: z.optional(PairRolesSchema),
});
export type NeighborInfo = z.infer<typeof NeighborInfoSchema>;

export const NeighborsResponseSchema = z.object({
  drug: z.string(),
  neighbors: z.array(NeighborInfoSchema),
});

export const DrugSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  degree: z.number(),
  /** RxNorm names: brands, ingredient (INN/USAN) and salts */
  aliases: z.optional(z.array(z.string())),
  /** interaction counts: [contraindicated, severe, moderate, mild] */
  severity_mix: z.optional(z.tuple([z.number(), z.number(), z.number(), z.number()])),
});
export type DrugSummary = z.infer<typeof DrugSummarySchema>;

export const DatasetStatsSchema = z.object({
  drugs: z.number(),
  interactions: z.number(),
  severity_mix: z.record(z.string(), z.number()),
});
export type DatasetStats = z.infer<typeof DatasetStatsSchema>;

export const DrugsResponseSchema = z.object({
  drugs: z.array(DrugSummarySchema),
  stats: DatasetStatsSchema,
  /** citations; `direction` = the FDA table behind neighbour `roles` */
  sources: z.optional(z.object({ direction: z.optional(SourceSchema) })),
});
export type DrugsResponse = z.infer<typeof DrugsResponseSchema>;

export const ResolveMatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  via: z.string(),
  source: z.enum(['local', 'rxnav']),
});
export type ResolveMatch = z.infer<typeof ResolveMatchSchema>;

export const ResolveResponseSchema = z.object({
  query: z.string(),
  matches: z.array(ResolveMatchSchema),
  rxnav: z.enum(['ok', 'disabled', 'skipped', 'unavailable']),
});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

export const LlmProviderSchema = z.enum(['stub', 'ollama', 'anthropic']);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;
/** both (default) = clinician section + patient handout draft in one call */
export const AudienceSchema = z.enum(['both', 'clinician', 'patient']);
export type Audience = z.infer<typeof AudienceSchema>;

export const ModelOptionSchema = z.object({
  provider: LlmProviderSchema,
  id: z.string(),
  label: z.string(),
  loaded: z.optional(z.boolean()),
  size_gb: z.optional(z.number()),
});
export type ModelOption = z.infer<typeof ModelOptionSchema>;

export const ProviderStatusSchema = z.object({
  provider: LlmProviderSchema,
  available: z.boolean(),
  note: z.optional(z.string()),
  models: z.array(ModelOptionSchema),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ModelsResponseSchema = z.object({
  default: z.object({ provider: LlmProviderSchema, model: z.string() }),
  providers: z.array(ProviderStatusSchema),
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

export const ExplanationPayloadSchema = z.object({
  explanation: z.string(),
  severity: z.string(),
  mechanism: z.string(),
  recommendation: z.string(),
});
export type ExplanationPayload = z.infer<typeof ExplanationPayloadSchema>;

export const ExplanationResponseSchema = z.object({
  drug_a: z.string(),
  drug_b: z.string(),
  direct_interaction: z.boolean(),
  chain_length: z.number(),
  /** authoritative dataset grade for direct pairs (never the model's) */
  dataset_severity: z.nullish(z.string()),
  severity_basis: z.nullish(z.string()),
  payload: z.nullable(ExplanationPayloadSchema),
  /** generated sections; with audience=both both are present */
  sections: z.optional(
    z.object({ clinician: z.optional(ExplanationPayloadSchema), patient: z.optional(ExplanationPayloadSchema) }),
  ),
  provider: z.optional(LlmProviderSchema),
  model: z.string(),
  audience: z.optional(AudienceSchema),
  stub: z.boolean(),
  disclaimer: z.string(),
});
export type ExplanationResponse = z.infer<typeof ExplanationResponseSchema>;

export const RegimenSchema = z.object({
  id: z.string(),
  label: z.string(),
  drug_ids: z.array(z.string()),
  dataset_version: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Regimen = z.infer<typeof RegimenSchema>;

export const OverrideEventSchema = z.object({
  id: z.number(),
  regimen_id: z.nullable(z.string()),
  drug_a: z.string(),
  drug_b: z.string(),
  action: z.enum(['override', 'revoke']),
  reason: z.string(),
  actor: z.string(),
  severity: z.string(),
  severity_basis: z.string(),
  created_at: z.string(),
});
export type OverrideEvent = z.infer<typeof OverrideEventSchema>;

export const RegimenListSchema = z.object({ store: z.string(), regimens: z.array(RegimenSchema) });
export const RegimenSavedSchema = z.object({ regimen: RegimenSchema, audit: z.optional(z.array(OverrideEventSchema)) });
export const RegimenDetailSchema = z.object({
  regimen: RegimenSchema,
  audit: z.array(OverrideEventSchema),
  active_overrides: z.array(OverrideEventSchema),
  current_dataset: z.boolean(),
});
export type RegimenDetail = z.infer<typeof RegimenDetailSchema>;
export const OverrideAppendedSchema = z.object({ event: OverrideEventSchema });
export const AuditSchema = z.object({ events: z.array(OverrideEventSchema) });

/** Dataset facts + model identity, sent first on the stream (before any model text). */
export const ExplainMetaSchema = z.object({
  drug_a: z.string(),
  drug_b: z.string(),
  direct_interaction: z.boolean(),
  chain_length: z.number(),
  dataset_severity: z.nullish(z.string()),
  severity_basis: z.nullish(z.string()),
  provider: z.optional(LlmProviderSchema),
  model: z.string(),
  audience: z.optional(AudienceSchema),
  stub: z.boolean(),
  disclaimer: z.string(),
});
export type ExplainMeta = z.infer<typeof ExplainMetaSchema>;

/** One NDJSON line of POST /explain/stream. */
export const StreamEventSchema = z.discriminatedUnion('type', [
  z.extend(ExplainMetaSchema, { type: z.literal('start') }),
  z.object({ type: z.literal('delta'), field: z.string(), text: z.string() }),
  z.extend(ExplanationResponseSchema, { type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.string(), error: z.string() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
