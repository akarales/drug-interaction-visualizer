/** Camera controls the graph exposes once mounted. */
export interface GraphHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}
