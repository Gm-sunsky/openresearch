/// <reference types="vite/client" />

import type { ResearchBoardApi } from "./shared/contracts";

declare global {
  interface Window {
    researchBoard?: ResearchBoardApi;
  }
}

export {};
