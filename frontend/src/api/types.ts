export interface GraphNode {
  id: string;
  name: string;
  category: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: string;
  direction: string;
  severity: string;
  mechanism: string;
  evidence: string;
}

export interface HubStat {
  id: string;
  name: string;
  degree: number;
}

export interface GraphStats {
  drugs: number;
  interactions: number;
  returned_nodes: number;
  returned_edges: number;
  hubs: HubStat[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  center?: string;
}

export interface NeighborInfo {
  id: string;
  name: string;
  category: string;
  kind: string;
  direction: string;
  severity: string;
  /** which rule graded the severity: kind:… | default:… | onc:<n> */
  severity_basis?: string;
  mechanism: string;
}

export interface DrugSummary {
  id: string;
  name: string;
  category: string;
  degree: number;
  /** RxNorm names: brands, ingredient (INN/USAN) and salts */
  aliases?: string[];
  /** interaction counts: [contraindicated, severe, moderate, mild] */
  severity_mix?: [number, number, number, number];
}

export interface ResolveMatch {
  id: string;
  name: string;
  via: string;
  source: 'local' | 'rxnav';
}

export interface ResolveResponse {
  query: string;
  matches: ResolveMatch[];
  rxnav: 'ok' | 'disabled' | 'skipped' | 'unavailable';
}

export type LlmProvider = 'stub' | 'ollama' | 'anthropic';
/** both (default) = clinician section + patient handout draft in one call */
export type Audience = 'both' | 'clinician' | 'patient';

export interface ModelOption {
  provider: LlmProvider;
  id: string;
  label: string;
  loaded?: boolean;
  size_gb?: number;
}

export interface ProviderStatus {
  provider: LlmProvider;
  available: boolean;
  note?: string;
  models: ModelOption[];
}

export interface ModelsResponse {
  default: { provider: LlmProvider; model: string };
  providers: ProviderStatus[];
}

export interface DatasetStats {
  drugs: number;
  interactions: number;
  severity_mix: Record<string, number>;
}

export interface DrugsResponse {
  drugs: DrugSummary[];
  stats: DatasetStats;
}

export interface ChainStep {
  from: string;
  to: string;
  kind: string;
  direction: string;
  severity: string;
}

export interface ChainResponse {
  from: string;
  to: string;
  max_hops: number;
  connected: boolean;
  steps: ChainStep[];
}

export interface ExplanationPayload {
  explanation: string;
  severity: string;
  mechanism: string;
  recommendation: string;
}

export interface ExplanationResponse {
  drug_a: string;
  drug_b: string;
  direct_interaction: boolean;
  chain_length: number;
  /** authoritative dataset grade for direct pairs (never the model's) */
  dataset_severity?: string | null;
  severity_basis?: string | null;
  payload: ExplanationPayload;
  /** generated sections; with audience=both both are present */
  sections?: { clinician?: ExplanationPayload; patient?: ExplanationPayload };
  provider?: LlmProvider;
  model: string;
  audience?: Audience;
  stub: boolean;
  disclaimer: string;
}
