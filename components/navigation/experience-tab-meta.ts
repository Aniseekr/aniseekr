import type { ComponentProps } from 'react';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TranslationKey } from '../../libs/i18n';
import type { ExperienceTabId } from '../../libs/navigation/experience-tabs';

export interface ExperienceTabMeta {
  labelKey: TranslationKey;
  icon: ComponentProps<typeof MaterialIcons>['name'];
}

export const EXPERIENCE_TAB_META: Record<ExperienceTabId, ExperienceTabMeta> = {
  discover: { labelKey: 'tabs.rate', icon: 'home-filled' },
  bangumi: { labelKey: 'tabs.bangumi', icon: 'date-range' },
  collection: { labelKey: 'tabs.collection', icon: 'bookmark' },
  pilgrimage: { labelKey: 'tabs.pilgrimage', icon: 'place' },
  explorerCamera: { labelKey: 'tabs.explorerCamera', icon: 'photo-camera' },
  explorerSearch: { labelKey: 'tabs.explorerSearch', icon: 'search' },
  explorerMap: { labelKey: 'tabs.explorerMap', icon: 'map' },
  explorerJournal: { labelKey: 'tabs.explorerJournal', icon: 'photo-library' },
  profile: { labelKey: 'tabs.profile', icon: 'person' },
};
