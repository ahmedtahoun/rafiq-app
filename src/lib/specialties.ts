import type { MessageKey } from './i18n';
import type { SpecialtyIconKey } from '../components/specialtyIcons';

export type SpecialtyCategory = 'mind' | 'body' | 'relationships' | 'career';

export interface SpecialtyDef {
  /** Stored value — English, stable, matches what a coach's profile.title
      is built from. Never translated; only its displayed label is. */
  value: string;
  icon: SpecialtyIconKey;
  category: SpecialtyCategory;
  labelKey: MessageKey;
}

// Ported 1:1 from the design's Onboarding.dc.html specialtyDefs — same
// 15 specialties, same 4-category grouping.
export const SPECIALTIES: SpecialtyDef[] = [
  { value: 'Life coaching', icon: 'life', category: 'mind', labelKey: 'specLife' },
  { value: 'Meditation coaching', icon: 'meditation', category: 'mind', labelKey: 'specMeditation' },
  { value: 'Breathwork coaching', icon: 'breathwork', category: 'mind', labelKey: 'specBreathwork' },
  { value: 'Stress & anxiety coaching', icon: 'stress', category: 'mind', labelKey: 'specStress' },
  { value: 'Sleep coaching', icon: 'sleep', category: 'mind', labelKey: 'specSleep' },
  { value: 'Yoga coaching', icon: 'yoga', category: 'body', labelKey: 'specYoga' },
  { value: 'Calisthenics coaching', icon: 'calisthenics', category: 'body', labelKey: 'specCalisthenics' },
  { value: 'Fitness coaching', icon: 'fitness', category: 'body', labelKey: 'specFitness' },
  { value: 'Nutrition coaching', icon: 'nutrition', category: 'body', labelKey: 'specNutrition' },
  { value: 'Free diving coaching', icon: 'freeDiving', category: 'body', labelKey: 'specFreeDiving' },
  { value: 'Scuba diving coaching', icon: 'scuba', category: 'body', labelKey: 'specScuba' },
  { value: 'Relationship coaching', icon: 'relationship', category: 'relationships', labelKey: 'specRelationship' },
  { value: 'Breakup coaching', icon: 'breakup', category: 'relationships', labelKey: 'specBreakup' },
  { value: 'Parenting coaching', icon: 'parenting', category: 'relationships', labelKey: 'specParenting' },
  { value: 'Career coaching', icon: 'career', category: 'career', labelKey: 'specCareer' },
];

export const SPECIALTY_CATEGORIES: { key: SpecialtyCategory; titleKey: MessageKey }[] = [
  { key: 'mind', titleKey: 'categoryMind' },
  { key: 'body', titleKey: 'categoryBody' },
  { key: 'relationships', titleKey: 'categoryRelationships' },
  { key: 'career', titleKey: 'categoryCareer' },
];
