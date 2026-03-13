import type { SurveyMeta } from '../types.js';
import { STORAGE_KEYS } from '../constants.js';
import { parseStored } from '../storage.js';

const _raw = parseStored<Record<string, string>>(STORAGE_KEYS.surveyMeta, {});
const _meta: SurveyMeta = {
  META_SurveyorInit: _raw['META_SurveyorInit'] ?? _raw['META_Surveyor'] ?? '',
  META_Project: _raw['META_Project'] ?? '',
  META_Site: _raw['META_Site'] ?? ''
};

export function getSurveyMeta(): SurveyMeta { return _meta; }

export function isSurveyMetadataComplete(): boolean {
  return Boolean(
    String(_meta.META_SurveyorInit || '').trim() &&
    String(_meta.META_Project || '').trim() &&
    String(_meta.META_Site || '').trim()
  );
}

export function requireSurveyMetadata(): boolean {
  if (isSurveyMetadataComplete()) return true;
  alert('Complete Survey Metadata before collecting data (Surveyor Initials, Project, Site).');
  const panel = document.getElementById('tools-panel');
  panel?.classList.remove('hidden');
  return false;
}

export function wireSurveyMetadataInputs(): void {
  const surveyorEl = document.getElementById('meta-surveyor-init') as HTMLInputElement | null;
  const projectEl = document.getElementById('meta-project') as HTMLInputElement | null;
  const siteEl = document.getElementById('meta-site') as HTMLInputElement | null;

  if (surveyorEl) surveyorEl.value = _meta.META_SurveyorInit;
  if (projectEl) projectEl.value = _meta.META_Project;
  if (siteEl) siteEl.value = _meta.META_Site;

  const save = () => {
    _meta.META_SurveyorInit = surveyorEl?.value.trim() ?? '';
    _meta.META_Project = projectEl?.value.trim() ?? '';
    _meta.META_Site = siteEl?.value.trim() ?? '';
    localStorage.setItem(STORAGE_KEYS.surveyMeta, JSON.stringify(_meta));
  };

  surveyorEl?.addEventListener('input', save);
  projectEl?.addEventListener('input', save);
  siteEl?.addEventListener('input', save);
}
