'use client';

import { useState, useRef, useEffect } from 'react';

interface EditableCellProps {
  value: string | number;
  onSave: (newValue: string | number) => Promise<void>;
  type?: 'text' | 'number' | 'select' | 'boolean';
  options?: { value: string; label: string }[];
  format?: (v: any) => string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export default function EditableCell({
  value,
  onSave,
  type = 'text',
  options,
  format,
  align = 'right',
  className = '',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const displayValue = format ? format(value) : String(value);

  async function handleSave() {
    const newVal = type === 'number' ? Number(editValue) : editValue;
    if (String(newVal) === String(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(newVal);
      setEditing(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditValue(String(value)); setEditing(false); }
  }

  if (type === 'boolean') {
    return (
      <td style={{ textAlign: 'center' }} className={className}>
        <button
          onClick={async () => {
            setSaving(true);
            await onSave(value ? 0 : 1);
            setSaving(false);
          }}
          disabled={saving}
          className={`px-2 py-0.5 rounded-full text-xs cursor-pointer ${
            value ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {saving ? '...' : value ? '재직' : '퇴사'}
        </button>
      </td>
    );
  }

  if (!editing) {
    return (
      <td
        style={{ textAlign: align }}
        className={`cursor-pointer hover:bg-blue-50 ${className}`}
        onDoubleClick={() => { setEditValue(String(value)); setEditing(true); }}
        title="더블클릭으로 수정"
      >
        {displayValue}
      </td>
    );
  }

  if (type === 'select' && options) {
    return (
      <td style={{ textAlign: align, padding: '2px 4px' }}>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full border rounded px-1 py-0.5 text-xs"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
    );
  }

  return (
    <td style={{ textAlign: align, padding: '2px 4px' }}>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type === 'number' ? 'number' : 'text'}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="w-full border rounded px-2 py-0.5 text-xs text-right"
        style={{ textAlign: align }}
      />
    </td>
  );
}
