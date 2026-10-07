import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addMessages, init, waitLocale } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import ContestCategoryModal from '$lib/components/ContestCategoryModal.svelte';
import type { AgeCategory, ContestCategories, WeightClass } from '$lib/types';

const api = vi.hoisted(() => ({
  put: vi.fn<(endpoint: string, body?: unknown) => Promise<{ data?: unknown; error: string | null }>>(),
  post: vi.fn<(endpoint: string, body?: unknown) => Promise<{ data?: unknown; error: string | null }>>(),
}));

vi.mock('$lib/api', () => ({
  ApiError: class ApiError extends Error {
    readonly status = 0;
  },
  apiClient: {
    put: (...args: [string, unknown?]) => api.put(...args),
    post: (...args: [string, unknown?]) => api.post(...args),
  },
}));

const contestId = 'contest-1';

const senior: AgeCategory = {
  id: 'age-senior',
  contestId,
  code: 'SENIOR',
  name: 'Senior',
  minAge: 24,
  maxAge: 39,
  sortOrder: 10,
  metadata: null,
};

const menOpen: WeightClass = {
  id: 'wc-m-open',
  contestId,
  code: 'M_OPEN',
  name: 'Men Open',
  gender: 'Male',
  minWeight: null,
  maxWeight: 105,
  sortOrder: 10,
  metadata: null,
};

const initialCategories: ContestCategories = {
  ageCategories: [senior],
  weightClasses: [menOpen],
};

function at<T>(items: T[], index: number, what: string): T {
  const item = items[index];
  if (!item) {
    throw new Error(`${what}[${index}] not found`);
  }
  return item;
}

function tableRows(container: HTMLElement, tableIndex: number): HTMLTableRowElement[] {
  const table = at(Array.from(container.querySelectorAll('table')), tableIndex, 'table');
  return Array.from(table.querySelectorAll('tbody tr')).filter(
    (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement,
  );
}

function rowInputs(row: HTMLTableRowElement): HTMLInputElement[] {
  return Array.from(row.querySelectorAll('input')).filter(
    (input): input is HTMLInputElement => input instanceof HTMLInputElement,
  );
}

function renderModal(onClose = vi.fn()) {
  return render(ContestCategoryModal, {
    contestId,
    initialCategories,
    hasRegistrations: false,
    onClose,
  });
}

describe('ContestCategoryModal', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
    api.put.mockReset();
    api.post.mockReset();
  });

  it('sends added rows without an id and keeps the ids of persisted rows', async () => {
    const onClose = vi.fn();
    const { container, getByRole } = renderModal(onClose);
    api.put.mockResolvedValue({ data: initialCategories, error: null });

    await fireEvent.click(getByRole('button', { name: 'Add Age Category' }));

    const newRow = at(tableRows(container, 0), 1, 'age row');
    const inputs = rowInputs(newRow);
    await fireEvent.input(at(inputs, 0, 'code'), { target: { value: 'junior' } });
    await fireEvent.input(at(inputs, 1, 'name'), { target: { value: 'Junior' } });
    await fireEvent.input(at(inputs, 2, 'min age'), { target: { value: '18' } });
    await fireEvent.input(at(inputs, 3, 'max age'), { target: { value: '23' } });

    await fireEvent.click(getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledTimes(1);
    });
    expect(api.put).toHaveBeenCalledWith(`/contests/${contestId}/categories`, {
      ageCategories: [
        {
          id: 'age-senior',
          contestId,
          code: 'SENIOR',
          name: 'Senior',
          minAge: 24,
          maxAge: 39,
          sortOrder: 10,
          metadata: null,
        },
        {
          contestId,
          code: 'JUNIOR',
          name: 'Junior',
          minAge: 18,
          maxAge: 23,
          sortOrder: 20,
          metadata: null,
        },
      ],
      weightClasses: [
        {
          id: 'wc-m-open',
          contestId,
          code: 'M_OPEN',
          name: 'Men Open',
          gender: 'Male',
          minWeight: null,
          maxWeight: 105,
          sortOrder: 10,
          metadata: null,
        },
      ],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('normalises edited values before saving', async () => {
    const { container, getByRole } = renderModal();
    api.put.mockResolvedValue({ data: initialCategories, error: null });

    const inputs = rowInputs(at(tableRows(container, 0), 0, 'age row'));
    await fireEvent.input(at(inputs, 0, 'code'), { target: { value: ' senior ' } });
    await fireEvent.input(at(inputs, 1, 'name'), { target: { value: 'Senior Open' } });
    await fireEvent.input(at(inputs, 2, 'min age'), { target: { value: '' } });

    await fireEvent.click(getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledTimes(1);
    });
    expect(api.put).toHaveBeenCalledWith(`/contests/${contestId}/categories`, {
      ageCategories: [
        {
          id: 'age-senior',
          contestId,
          code: 'SENIOR',
          name: 'Senior Open',
          minAge: null,
          maxAge: 39,
          sortOrder: 10,
          metadata: null,
        },
      ],
      weightClasses: [menOpen],
    });
  });

  it('replaces local rows with the server defaults on reset', async () => {
    const { container, getByRole } = renderModal();
    api.post.mockResolvedValue({
      data: {
        ageCategories: [
          {
            id: 'age-u18',
            contestId,
            code: 'U18',
            name: 'Under 18',
            minAge: 14,
            maxAge: 17,
            sortOrder: 10,
            metadata: null,
          },
        ],
        weightClasses: [],
      },
      error: null,
    });

    await fireEvent.click(getByRole('button', { name: 'Reset to Defaults' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(`/contests/${contestId}/categories/defaults`);
    });
    await waitFor(() => {
      expect(at(rowInputs(at(tableRows(container, 0), 0, 'age row')), 0, 'code').value).toBe('U18');
    });
    expect(tableRows(container, 0)).toHaveLength(1);
  });

  it('restores the initial rows when changes are reverted', async () => {
    const { container, getByRole } = renderModal();

    const inputs = rowInputs(at(tableRows(container, 0), 0, 'age row'));
    await fireEvent.input(at(inputs, 1, 'name'), { target: { value: 'Changed' } });
    expect(at(rowInputs(at(tableRows(container, 0), 0, 'age row')), 1, 'name').value).toBe('Changed');

    await fireEvent.click(getByRole('button', { name: 'Revert Changes' }));

    await waitFor(() => {
      expect(at(rowInputs(at(tableRows(container, 0), 0, 'age row')), 1, 'name').value).toBe('Senior');
    });
    expect(api.put).not.toHaveBeenCalled();
  });
});
