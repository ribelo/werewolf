import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import ContestEditorModal from '$lib/components/ContestEditorModal.svelte';
import type { ContestDetail, ContestTag, LiftType } from '$lib/types';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('$lib/api', () => ({
  ApiError: class ApiError extends Error {
    readonly status = 0;
  },
  apiClient: {
    get: (...args: unknown[]) => api.get(...args),
    post: (...args: unknown[]) => api.post(...args),
    patch: (...args: unknown[]) => api.patch(...args),
    put: (...args: unknown[]) => api.put(...args),
    delete: (...args: unknown[]) => api.delete(...args),
  },
}));

const contest: ContestDetail = {
  id: 'contest-1',
  name: 'Autumn Cup',
  date: '2025-10-11',
  location: 'Gdansk',
  discipline: 'Powerlifting',
  status: 'Draft',
  mensBarWeight: 20,
  womensBarWeight: 15,
  clampWeight: 2.5,
  registrations: [],
};

const initialEvents: LiftType[] = ['Squat', 'Bench', 'Deadlift'];

function buildTag(id: string, label: string): ContestTag {
  return {
    id,
    contestId: contest.id,
    label,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function tagInput(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector(`#contest-tag-${id}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`tag input for ${id} not found`);
  }
  return input;
}

function tagRow(container: HTMLElement, id: string): HTMLElement {
  const row = tagInput(container, id).closest('.space-y-2');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`tag row for ${id} not found`);
  }
  return row;
}

function tagButton(container: HTMLElement, id: string, label: string): HTMLButtonElement {
  const button = Array.from(tagRow(container, id).querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`button "${label}" for ${id} not found`);
  }
  return button;
}

function renderModal() {
  return render(ContestEditorModal, {
    contest,
    initialEvents,
    contestTags: [buildTag('tag-open', 'Open'), buildTag('tag-raw', 'Raw')],
    onClose: vi.fn(),
  });
}

describe('ContestEditorModal tag rows', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.put.mockReset();
    api.delete.mockReset();
    api.get.mockResolvedValue({
      data: [buildTag('tag-open', 'Open'), buildTag('tag-raw', 'Raw')],
      error: null,
    });
  });

  it('leaves the mandatory tag without row actions', () => {
    const { container } = renderModal();

    expect(tagInput(container, 'tag-open').disabled).toBe(true);
    expect(tagRow(container, 'tag-open').querySelectorAll('button')).toHaveLength(0);
  });

  it('enables save and reset as soon as the label changes', async () => {
    const { container } = renderModal();

    expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(true);
    expect(tagButton(container, 'tag-raw', 'Reset').disabled).toBe(true);

    await fireEvent.input(tagInput(container, 'tag-raw'), { target: { value: 'Raw classic' } });

    await waitFor(() => {
      expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(false);
    });
    expect(tagButton(container, 'tag-raw', 'Reset').disabled).toBe(false);
  });

  it('restores the stored label on reset and disables save again', async () => {
    const { container } = renderModal();

    await fireEvent.input(tagInput(container, 'tag-raw'), { target: { value: 'Raw classic' } });
    await waitFor(() => {
      expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(false);
    });

    await fireEvent.click(tagButton(container, 'tag-raw', 'Reset'));

    await waitFor(() => {
      expect(tagInput(container, 'tag-raw').value).toBe('Raw');
    });
    expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(true);
  });

  it('saves the trimmed label through the row id and refreshes the rows', async () => {
    const { container } = renderModal();
    api.patch.mockResolvedValue({ data: buildTag('tag-raw', 'Raw classic'), error: null });
    api.get.mockResolvedValue({
      data: [buildTag('tag-open', 'Open'), buildTag('tag-raw', 'Raw classic')],
      error: null,
    });

    await fireEvent.input(tagInput(container, 'tag-raw'), { target: { value: '  Raw classic  ' } });
    await waitFor(() => {
      expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(false);
    });

    await fireEvent.click(tagButton(container, 'tag-raw', 'Save'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
    });
    expect(api.patch).toHaveBeenCalledWith('/contests/contest-1/tags/tag-raw', {
      label: 'Raw classic',
    });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/contests/contest-1/tags');
    });
    await waitFor(() => {
      expect(tagInput(container, 'tag-raw').value).toBe('Raw classic');
    });
    expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(true);
  });

  it('shows save failures on the row and clears the saving state', async () => {
    const { container } = renderModal();
    api.patch.mockRejectedValue(new Error('Tag update rejected'));

    await fireEvent.input(tagInput(container, 'tag-raw'), { target: { value: 'Raw classic' } });
    await waitFor(() => {
      expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(false);
    });

    await fireEvent.click(tagButton(container, 'tag-raw', 'Save'));

    await waitFor(() => {
      expect(tagRow(container, 'tag-raw').textContent).toContain('Tag update rejected');
    });
    expect(tagButton(container, 'tag-raw', 'Save').disabled).toBe(false);
    expect(tagButton(container, 'tag-raw', 'Save').textContent?.trim()).toBe('Save');
  });
});
