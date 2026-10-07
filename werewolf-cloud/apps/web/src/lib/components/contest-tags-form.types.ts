/**
 * Contract shared between ContestTagsForm and the screens that render it.
 *
 * Svelte 4 instance scripts cannot export types, so the row view model and the
 * dispatcher payloads live in this plain module instead.
 */

/** View model for a single contest tag row. */
export type ContestTagRowView = {
  id: string;
  label: string;
  isMandatory: boolean;
  error?: string | null;
  inputDisabled?: boolean;
  showReset?: boolean;
  showSave?: boolean;
  showDelete?: boolean;
  resetDisabled?: boolean;
  saveDisabled?: boolean;
  deleteDisabled?: boolean;
  saving?: boolean;
  deleting?: boolean;
};

/** Payload of the `rowChange` event: row id plus the raw input value. */
export type ContestTagRowChangeDetail = {
  id: string;
  value: string;
};

/** Payload of the row-scoped actions (`reset`, `save`, `delete`). */
export type ContestTagRowActionDetail = {
  id: string;
};

/** Payload of the `newTagInput` event. */
export type ContestTagNewLabelDetail = {
  value: string;
};
