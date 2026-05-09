/**
 * Renders one field from a `DraftField` schema. Text / textarea route
 * through the Field primitives; list-typed fields use EditableList so
 * the row-add / row-remove / blur-commits keyboard model is consistent
 * with the rest of the app.
 */
import EditableList from './EditableList';
import { Field, TextArea, TextInput } from './Field';
import type { DraftField as DraftFieldDef } from '../types';
import { t } from '../design/tokens';

interface Props {
  field: DraftFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

export default function DraftField({ field, value, onChange, disabled }: Props) {
  if (field.type === 'list') {
    const items = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ marginBottom: t.space.md }}>
        <EditableList
          title={field.label + (field.required ? ' *' : '')}
          items={items}
          onChange={next => onChange(next)}
          addLabel={`Add ${field.label.toLowerCase()}`}
        />
        {field.hint && (
          <p
            className="m-0"
            style={{
              fontSize: t.size.micro,
              color: t.color.dim,
              marginTop: t.space.xs,
            }}
          >
            {field.hint}
          </p>
        )}
      </div>
    );
  }

  const id = `draft-field-${field.id}`;
  const label = field.label + (field.required ? ' *' : '');
  const str = typeof value === 'string' ? value : '';

  if (field.type === 'textarea') {
    return (
      <Field label={label} htmlFor={id} hint={field.hint}>
        <TextArea
          id={id}
          value={str}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={3}
          style={{ minHeight: '90px' }}
        />
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={field.hint}>
      <TextInput
        id={id}
        value={str}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
      />
    </Field>
  );
}
