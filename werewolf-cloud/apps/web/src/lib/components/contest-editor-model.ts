import type { ContestTag } from '$lib/types';
import type { ContestTagRowView } from './contest-tags-form.types';

/** Tag every contest is created with; it cannot be renamed or removed. */
export const MANDATORY_TAG_LABEL = 'Open';

/** Editable state of one contest tag row inside ContestEditorModal. */
export type TagRow = {
  id: string;
  label: string;
  originalLabel: string;
  isMandatory: boolean;
  saving: boolean;
  deleting: boolean;
  error: string | null;
};

export function createTagRow(tag: ContestTag): TagRow {
  return {
    id: tag.id,
    label: tag.label,
    originalLabel: tag.label,
    isMandatory: tag.label === MANDATORY_TAG_LABEL,
    saving: false,
    deleting: false,
    error: null,
  };
}

export function createTagRows(tags: readonly ContestTag[]): TagRow[] {
  return tags.map(createTagRow);
}

/**
 * Returns a new row list with `patch` applied to the row with `id`.
 *
 * The array reference changes so Svelte invalidates everything derived from it
 * (button/loading/error state); unknown ids leave the list untouched.
 */
export function patchTagRow(rows: TagRow[], id: string, patch: Partial<TagRow>): TagRow[] {
  let patched = false;
  const next = rows.map((row) => {
    if (row.id !== id) {
      return row;
    }
    patched = true;
    return { ...row, ...patch };
  });
  return patched ? next : rows;
}

export function tagRowHasChanges(row: TagRow): boolean {
  return row.label.trim() !== row.originalLabel;
}

export function toTagRowView(row: TagRow, tagsLoading: boolean): ContestTagRowView {
  const busy = row.saving || row.deleting || tagsLoading;
  const changed = tagRowHasChanges(row);
  return {
    id: row.id,
    label: row.label,
    isMandatory: row.isMandatory,
    error: row.error,
    inputDisabled: row.isMandatory || busy,
    showReset: !row.isMandatory,
    showSave: !row.isMandatory,
    showDelete: !row.isMandatory,
    resetDisabled: busy || !changed,
    saveDisabled: busy || !changed,
    deleteDisabled: busy,
    saving: row.saving,
    deleting: row.deleting,
  };
}
