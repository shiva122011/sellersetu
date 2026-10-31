// Shared dynamic-form + document-checklist types and evaluation helpers.
// Used by both the API routes (validation, checklist generation) and the UI
// (form rendering with conditional logic, checklist display).

export type FormFieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'date'
  | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'file'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  helpText?: string
  required: boolean
  options?: string[]            // select / multiselect / radio / checkbox
  showIf?: { fieldId: string; values: string[] } // conditional display
}

export interface FormConfig {
  fields: FormField[]
}

export type FormValue = string | string[] | boolean | undefined
export type FormResponses = Record<string, FormValue>

export interface DocRequirement {
  id: string
  label: string
  category: string
  mandatory: boolean
  description?: string
  showIf?: { fieldId: string; values: string[] }
}

export interface DocRequirements {
  documents: DocRequirement[]
}

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text field' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'radio', label: 'Radio buttons' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file', label: 'File upload' },
]

// ---------- parsing / validation ----------

export function parseFormConfig(raw: string | null | undefined): FormConfig {
  try {
    const parsed = JSON.parse(raw || '{"fields":[]}')
    if (parsed && Array.isArray(parsed.fields)) return parsed as FormConfig
  } catch { /* fall through */ }
  return { fields: [] }
}

export function parseDocRequirements(raw: string | null | undefined): DocRequirements {
  try {
    const parsed = JSON.parse(raw || '{"documents":[]}')
    if (parsed && Array.isArray(parsed.documents)) return parsed as DocRequirements
  } catch { /* fall through */ }
  return { documents: [] }
}

export function stringifyFormConfig(config: FormConfig): string {
  return JSON.stringify({ fields: (config.fields || []).map((f) => ({
    id: String(f.id || '').trim(),
    type: f.type,
    label: String(f.label || '').trim(),
    placeholder: f.placeholder ? String(f.placeholder) : undefined,
    helpText: f.helpText ? String(f.helpText) : undefined,
    required: !!f.required,
    options: Array.isArray(f.options) ? f.options.map(String).filter(Boolean) : undefined,
    showIf: f.showIf && f.showIf.fieldId && f.showIf.values?.length
      ? { fieldId: String(f.showIf.fieldId), values: f.showIf.values.map(String) }
      : undefined,
  })) })
}

export function stringifyDocRequirements(reqs: DocRequirements): string {
  return JSON.stringify({ documents: (reqs.documents || []).map((d) => ({
    id: String(d.id || '').trim(),
    label: String(d.label || '').trim(),
    category: String(d.category || 'OTHER'),
    mandatory: !!d.mandatory,
    description: d.description ? String(d.description) : undefined,
    showIf: d.showIf && d.showIf.fieldId && d.showIf.values?.length
      ? { fieldId: String(d.showIf.fieldId), values: d.showIf.values.map(String) }
      : undefined,
  })) })
}

// ---------- conditional visibility ----------

function valuesOverlap(a: FormValue, b: string[]): boolean {
  const norm = (v: FormValue): string[] => {
    if (v === undefined || v === null || v === '' || v === false) return []
    if (Array.isArray(v)) return v.map(String)
    return [String(v)]
  }
  return norm(a).some((v) => b.includes(v))
}

/** Is this field visible given the current answers? (conditional logic) */
export function isFieldVisible(field: FormField, responses: FormResponses): boolean {
  if (!field.showIf || !field.showIf.fieldId) return true
  return valuesOverlap(responses[field.showIf.fieldId], field.showIf.values)
}

/** Is this document requirement applicable given the customer's answers? */
export function isRequirementVisible(
  req: DocRequirement,
  responses: FormResponses
): boolean {
  if (!req.showIf || !req.showIf.fieldId) return true
  return valuesOverlap(responses[req.showIf.fieldId], req.showIf.values)
}

/**
 * Server-side validation of submitted form responses against the config.
 * Returns an error message, or null when valid. Hidden fields are ignored,
 * required visible fields must have a value.
 */
export function validateFormResponses(
  config: FormConfig,
  responses: FormResponses
): string | null {
  for (const field of config.fields) {
    if (!isFieldVisible(field, responses)) continue
    if (!field.required) continue
    const v = responses[field.id]
    const empty = v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0)
    if (empty) return `Please fill the required field: "${field.label}"`
  }
  return null
}

// ---------- checklist helpers ----------

export const REQUIREMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Waiting for upload',
  UPLOADED: 'Submitted — under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected — re-upload needed',
  WAIVED: 'Not required (waived by team)',
}

/** Visible requirements for a service line, evaluated against its form answers. */
export function visibleRequirements(
  service: { docRequirements: string },
  responses: FormResponses
): DocRequirement[] {
  const { documents } = parseDocRequirements(service.docRequirements)
  return documents.filter((d) => isRequirementVisible(d, responses))
}
