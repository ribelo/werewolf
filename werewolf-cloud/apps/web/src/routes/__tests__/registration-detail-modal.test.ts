import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { addMessages, init, waitLocale } from 'svelte-i18n';

import RegistrationDetailModal from '$lib/components/RegistrationDetailModal.svelte';
import en from '$lib/i18n/locales/en.json';
import type { Registration, WeightClass, AgeCategory } from '$lib/types';

describe('RegistrationDetailModal', () => {
  beforeEach(async () => {
    addMessages('en', en);
    init({ fallbackLocale: 'en', initialLocale: 'en' });
    await waitLocale();
  });

  const registration: Registration = {
    id: 'reg-1',
    competitorId: 'comp-1',
    firstName: 'Alex',
    lastName: 'Strong',
    birthDate: '1990-05-12',
    gender: 'Male',
    club: 'Iron Club',
    city: 'Gotham',
    weightClassId: 'wc1',
    weightClassName: 'Do 100 kg',
  ageCategoryId: 'ac-senior',
  ageCategoryName: 'Senior (24-39)',
  bodyweight: 93.5,
  rackHeightSquat: 44,
  rackHeightBench: 39,
  reshelCoefficient: 0.945,
  mcculloughCoefficient: 1.0,
  competitionOrder: 7,
  };

  const weightClasses: WeightClass[] = [
    { id: 'wc1', code: 'M_100', name: 'Do 100 kg', gender: 'Male', minWeight: 90, maxWeight: 100 },
  ];

  const ageCategories: AgeCategory[] = [
    { id: 'ac-senior', code: 'SENIOR', name: 'Senior (24-39)', minAge: 24, maxAge: 39 },
  ];

  it('renders registration profile and coefficients', () => {
    render(RegistrationDetailModal, {
      registration,
      weightClasses,
      ageCategories,
      reshelSource: 'http://example.com/reshel',
      reshelRetrievedAt: '2025-01-01T00:00:00Z',
      mccSource: 'http://example.com/mcc',
      mccRetrievedAt: '2025-02-01T00:00:00Z',
      onClose: vi.fn(),
      onEditCompetitor: vi.fn(),
    });

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Alex Strong')).toBeInTheDocument();
    expect(screen.getByText('Do 100 kg')).toBeInTheDocument();
    expect(screen.getByText('Senior (24-39)')).toBeInTheDocument();
    expect(screen.getByText('0.945')).toBeInTheDocument();
    expect(screen.getByText('1.000')).toBeInTheDocument();
  });

  it('invokes edit callback when edit button is clicked', async () => {
    const onClose = vi.fn();
    const onEditCompetitor = vi.fn();

    render(RegistrationDetailModal, {
      registration,
      weightClasses,
      ageCategories,
      reshelSource: 'http://example.com/reshel',
      reshelRetrievedAt: '2025-01-01T00:00:00Z',
      mccSource: 'http://example.com/mcc',
      mccRetrievedAt: '2025-02-01T00:00:00Z',
      onClose,
      onEditCompetitor,
    });

    const editButton = screen.getByRole('button', { name: 'Edit competitor' });
    await fireEvent.click(editButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEditCompetitor).toHaveBeenCalledTimes(1);
    expect(onEditCompetitor).toHaveBeenCalledWith(registration);
  });
});
