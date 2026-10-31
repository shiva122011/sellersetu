'use client'

// Dynamic form renderer driven by admin-configured FormConfig.
// - DynamicForm: editable (request wizard) with live conditional logic
// - FormResponsesView: read-only summary (dashboards)

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { UploadCloud } from 'lucide-react'
import {
  parseFormConfig, isFieldVisible,
  FormField, FormResponses, FormValue,
} from '@/lib/forms'

interface DynamicFormProps {
  config: string // JSON FormConfig
  responses: FormResponses
  onChange: (responses: FormResponses) => void
  files: Record<string, File | null>
  onFileChange: (fieldId: string, file: File | null) => void
  disabled?: boolean
}

export function DynamicForm({ config, responses, onChange, files, onFileChange, disabled }: DynamicFormProps) {
  const parsed = useMemo(() => parseFormConfig(config), [config])
  const visible = parsed.fields.filter((f) => isFieldVisible(f, responses))

  if (parsed.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional questions for this service.</p>
  }

  function set(fieldId: string, value: FormValue) {
    onChange({ ...responses, [fieldId]: value })
  }

  return (
    <div className="space-y-4">
      {visible.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={responses[field.id]}
          onChange={(v) => set(field.id, v)}
          file={files[field.id] || null}
          onFileChange={(f) => onFileChange(field.id, f)}
          disabled={disabled}
        />
      ))}
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">Answer the questions above to see the remaining fields.</p>
      )}
    </div>
  )
}

function FieldInput({
  field, value, onChange, file, onFileChange, disabled,
}: {
  field: FormField
  value: FormValue
  onChange: (v: FormValue) => void
  file: File | null
  onFileChange: (f: File | null) => void
  disabled?: boolean
}) {
  const inputCls = 'focus-visible:ring-emerald-500'
  const requiredMark = field.required ? <span className="text-red-500"> *</span> : null

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`ff-${field.id}`} className="text-sm">
        {field.label}{requiredMark}
      </Label>

      {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'number' || field.type === 'date') && (
        <Input
          id={`ff-${field.id}`}
          type={field.type === 'phone' ? 'tel' : field.type}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={inputCls}
        />
      )}

      {field.type === 'textarea' && (
        <textarea
          id={`ff-${field.id}`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      )}

      {field.type === 'select' && (
        <select
          id={`ff-${field.id}`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <option value="">{field.placeholder || 'Select an option…'}</option>
          {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )}

      {field.type === 'multiselect' && (
        <div className="flex flex-wrap gap-2">
          {(field.options || []).map((opt) => {
            const arr = Array.isArray(value) ? value : []
            const checked = arr.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => onChange(checked ? arr.filter((v) => v !== opt) : [...arr, opt])}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${checked ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-medium' : 'border-stone-200 text-stone-600 hover:border-emerald-300'}`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )}

      {field.type === 'radio' && (
        <div className="space-y-2">
          {(field.options || []).map((opt) => (
            <label key={opt} className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition-all text-sm ${value === opt ? 'border-emerald-500 bg-emerald-50' : 'hover:border-emerald-300'}`}>
              <input
                type="radio"
                name={`ff-${field.id}`}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="h-4 w-4 accent-emerald-600"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {field.type === 'checkbox' && (
        <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>{field.placeholder || 'Yes'}</span>
        </label>
      )}

      {field.type === 'file' && (
        <div className="rounded-xl border border-dashed p-3">
          <input
            id={`ff-${field.id}`}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            disabled={disabled}
          />
          {file ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <button type="button" onClick={() => onFileChange(null)} className="text-xs text-red-600 hover:underline" disabled={disabled}>
                Remove
              </button>
            </div>
          ) : (
            <label htmlFor={`ff-${field.id}`} className="flex items-center gap-2 text-sm text-emerald-700 cursor-pointer hover:underline">
              <UploadCloud className="h-4 w-4" /> Choose a file to attach with this answer
            </label>
          )}
        </div>
      )}

      {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
    </div>
  )
}

// ---------- read-only ----------

export function FormResponsesView({ config, responses }: { config: string; responses: string }) {
  const parsed = useMemo(() => parseFormConfig(config), [config])
  let answers: FormResponses = {}
  try {
    const r = JSON.parse(responses || '{}')
    if (r && typeof r === 'object') answers = r
  } catch { /* ignore */ }

  const visible = parsed.fields.filter((f) => isFieldVisible(f, answers))
  if (visible.length === 0) return null

  function renderValue(field: FormField): string {
    const v = answers[field.id]
    if (v === undefined || v === null || v === '' || v === false) return '—'
    if (Array.isArray(v)) return v.join(', ')
    if (v === true) return 'Yes'
    return String(v)
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3 text-sm">
      {visible.map((f) => (
        <div key={f.id}>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            {f.label}
            {f.type === 'file' && <Badge variant="outline" className="text-[9px] px-1 py-0">file</Badge>}
          </p>
          <p className="font-medium break-words whitespace-pre-wrap">{renderValue(f)}</p>
        </div>
      ))}
    </div>
  )
}
