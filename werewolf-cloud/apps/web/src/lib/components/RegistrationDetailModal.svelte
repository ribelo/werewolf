<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { formatCompetitorName, formatWeightClass, formatAgeClass, formatCoefficient, formatWeight } from '$lib/utils';
  import type { Registration, WeightClass, AgeCategory } from '$lib/types';

  export let registration: Registration;
  export let weightClasses: WeightClass[] = [];
  export let ageCategories: AgeCategory[] = [];
  export let reshelSource: string;
  export let reshelRetrievedAt: string;
  export let mccSource: string;
  export let mccRetrievedAt: string;
  export let onClose: () => void;
  export let onEditCompetitor: (registration: Registration) => void = () => {};

  const tStore = _;
  type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

  const t = (key: string, values?: MessageValues): string => {
    const translate = get(tStore);
    return translate(key, values ? { values } : undefined);
  };

  const reshelMeta = {
    source: reshelSource,
    retrievedAt: safeDate(reshelRetrievedAt),
  };

  const mccMeta = {
    source: mccSource,
    retrievedAt: safeDate(mccRetrievedAt),
  };

  function safeDate(value: string | undefined): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString();
  }

  function handleEditCompetitor() {
    onClose();
    onEditCompetitor(registration);
  }
</script>

<div class="space-y-6">
  <section>
    <h3 class="text-h3 text-text-primary mb-4">{t('contest_detail.registration_detail.sections.profile')}</h3>
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-lg border border-border-color bg-element-bg/60 p-4">
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.fields.lifter')}</p>
        <p class="text-body text-text-primary">{formatCompetitorName(registration.firstName, registration.lastName)}</p>
      </div>
      <div class="rounded-lg border border-border-color bg-element-bg/60 p-4">
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.fields.bodyweight')}</p>
        <p class="text-body text-text-primary">{formatWeight(registration.bodyweight)}</p>
      </div>
      <div class="rounded-lg border border-border-color bg-element-bg/60 p-4">
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.fields.weight_class')}</p>
        <p class="text-body text-text-primary">{registration.weightClassName ?? formatWeightClass(registration.weightClassId, weightClasses)}</p>
      </div>
      <div class="rounded-lg border border-border-color bg-element-bg/60 p-4">
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.fields.age_class')}</p>
        <p class="text-body text-text-primary">{registration.ageCategoryName ?? formatAgeClass(registration.ageCategoryId, ageCategories)}</p>
      </div>
    </div>
  </section>

  <section>
    <header class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-h3 text-text-primary">{t('contest_detail.registration_detail.sections.coefficients')}</h3>
        <p class="text-caption text-text-secondary mt-1">{t('contest_detail.registration_detail.coefficients.auto_notice')}</p>
      </div>
    </header>
    <div class="grid gap-4 md:grid-cols-2">
      <div
        class="rounded-lg border border-border-color bg-element-bg/60 p-4"
        title={`${t('contest_detail.registration_detail.coefficients.source_label')}: ${reshelMeta.source}${reshelMeta.retrievedAt ? `, ${t('contest_detail.registration_detail.coefficients.retrieved_at', { date: reshelMeta.retrievedAt })}` : ''}`}
      >
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.coefficients.reshel')}</p>
        <p class="text-body text-text-primary">{formatCoefficient(registration.reshelCoefficient)}</p>
      </div>
      <div
        class="rounded-lg border border-border-color bg-element-bg/60 p-4"
        title={`${t('contest_detail.registration_detail.coefficients.source_label')}: ${mccMeta.source}${mccMeta.retrievedAt ? `, ${t('contest_detail.registration_detail.coefficients.retrieved_at', { date: mccMeta.retrievedAt })}` : ''}`}
      >
        <p class="text-caption text-text-secondary uppercase tracking-[0.3em] mb-1">{t('contest_detail.registration_detail.coefficients.mcc')}</p>
        <p class="text-body text-text-primary">{formatCoefficient(registration.mcculloughCoefficient)}</p>
      </div>
    </div>
  </section>

  <footer class="flex flex-wrap gap-2 justify-end">
    <button type="button" class="btn-secondary px-4 py-2" on:click={onClose}>
      {t('buttons.close')}
    </button>
    <button type="button" class="btn-primary px-4 py-2" on:click={handleEditCompetitor}>
      {t('contest_detail.registration_detail.actions.edit_competitor')}
    </button>
  </footer>
</div>
