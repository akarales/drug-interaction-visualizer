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
  mechanism: string;
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
  payload: ExplanationPayload;
  model: string;
  stub: boolean;
  disclaimer: string;
}
