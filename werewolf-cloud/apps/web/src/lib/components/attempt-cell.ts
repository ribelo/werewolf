import type { Attempt } from '$lib/types';
import type { AttemptCell } from '$lib/contest-table';

/**
 * Everything a single attempt cell needs to decide what to render.
 * Built by the table from its own props; the cell never reads loading maps itself.
 */
export interface AttemptCellDisplay {
  /** Registration does not compete in this lift → render the empty placeholder. */
  liftEnabled: boolean;
  /** Display surfaces render a static status pill and weight text instead of controls. */
  readOnly: boolean;
  /** This attempt is the one currently live on the platform. */
  live: boolean;
  /** A "set live" request for this attempt is in flight. */
  livePending: boolean;
  /** A status cycle request for this attempt is in flight. */
  statusPending: boolean;
  /** A weight edit for this cell is awaiting persistence; further edits are ignored. */
  weightPending: boolean;
}

/**
 * Attempt mutations a cell can trigger. The table builds this once and passes the
 * same object to every cell, so no callbacks are created while rendering.
 */
export interface AttemptCellActions {
  setLive: (attempt: Attempt) => void;
  cycleStatus: (attempt: Attempt) => void;
  commitWeight: (registrationId: string, cell: AttemptCell, weight: number) => void;
}
