import type { AppFeature, FeatureProperties, FeatureSource } from '../types.js';
import { newId, buildFeatureName } from '../coord/formatters.js';
import { getSurveyMeta } from '../ui/surveyMeta.js';

export function ensureFeatureProperties(feature: AppFeature, sourceHint: FeatureSource = 'sketch'): AppFeature {
  const now = new Date().toISOString();
  const props = (feature.properties ?? {}) as Partial<FeatureProperties>;
  const createdAt = props.created_at || now;
  const createdDate = new Date(createdAt);
  const safeDate = Number.isNaN(createdDate.getTime()) ? new Date() : createdDate;

  const meta = getSurveyMeta();
  const surveyorInit = (props.META_SurveyorInit ?? (props as Record<string, unknown>)['META_Surveyor'] as string ?? meta.META_SurveyorInit) || '';

  feature.properties = {
    id: props.id || newId(),
    name: props.name || buildFeatureName(safeDate, surveyorInit),
    type: props.type || '',
    notes: props.notes || '',
    created_at: createdAt,
    updated_at: props.updated_at || props.created_at || now,
    source: props.source || sourceHint,
    META_SurveyorInit: surveyorInit,
    META_Project: props.META_Project ?? meta.META_Project,
    META_Site: props.META_Site ?? meta.META_Site,
    // Computed style properties – set to defaults; overwritten by featureLayer
    _fillColor: props._fillColor ?? '#e63946',
    _strokeColor: props._strokeColor ?? '#000000',
    _radius: props._radius ?? 7,
    _weight: props._weight ?? 3,
    _fillOpacity: props._fillOpacity ?? 0.4,
    _visible: props._visible ?? true,
    _labelVisible: props._labelVisible ?? false,
    _labelText: props._labelText ?? ''
  };
  return feature;
}

export function touchFeature(feature: AppFeature): void {
  if (feature.properties) {
    feature.properties.updated_at = new Date().toISOString();
  }
}

export function isFeatureCollection(obj: unknown): obj is { type: 'FeatureCollection'; features: AppFeature[] } {
  return Boolean(obj && typeof obj === 'object' && (obj as Record<string, unknown>).type === 'FeatureCollection' && Array.isArray((obj as Record<string, unknown>).features));
}
