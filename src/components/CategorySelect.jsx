import React, { useState } from 'react';
import { db } from '../db/db.js';

export default function CategorySelect({
  id,
  label = 'Categoría',
  value,
  onChange,
  tags = [],
  kind = 'EXPENSE',
  className = '',
  required = false,
  allowCreate = true,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPillar, setNewPillar] = useState('NEED');
  const [error, setError] = useState('');
  const filteredTags = tags.filter(tag => kind === 'EXPENSE' ? (tag.kind || 'EXPENSE') === 'EXPENSE' : tag.kind === kind);
  const sortedTags = [...filteredTags].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;

    const existing = sortedTags.find(tag => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange(existing.id.toString());
      setNewName('');
      setIsAdding(false);
      setError('');
      return;
    }

    try {
      const id = await db.tags.add({
        name,
        kind,
        ...(kind === 'EXPENSE' ? { pillar: newPillar } : {}),
      });
      onChange(id.toString());
      setNewName('');
      setNewPillar('NEED');
      setIsAdding(false);
      setError('');
    } catch {
      setError('No se pudo crear la categoría');
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <label className="muji-header block mb-1" htmlFor={id}>{label}</label>
        {allowCreate && <button
          type="button"
          onClick={() => {
            setIsAdding(prev => !prev);
            setNewPillar('NEED');
            setError('');
          }}
          className="mb-1 font-mono text-[9px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
        >
          {isAdding ? 'Cancelar' : '+ Nueva'}
        </button>}
      </div>

      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full border border-[#1A1A1A]/40 bg-transparent px-2 py-2 font-mono text-[12px] text-noria-text outline-none focus:border-[#647C78]"
      >
        <option value="">{required ? 'Selecciona categoría...' : 'Sin categoría'}</option>
        {(() => {
          const parentTags = sortedTags.filter(tag => !tag.parentId);
          const subTags = sortedTags.filter(tag => tag.parentId);
          
          return (
            <>
              {parentTags.map(parent => {
                const children = subTags.filter(st => st.parentId === parent.id);
                if (children.length > 0) {
                  return (
                    <optgroup key={parent.id} label={parent.name.toUpperCase()}>
                      {children.map(child => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                }
                return (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                );
              })}
              {/* Orphaned subcategories */}
              {subTags.filter(st => !parentTags.some(p => p.id === st.parentId)).map(orphan => (
                <option key={orphan.id} value={orphan.id}>
                  {orphan.name}
                </option>
              ))}
            </>
          );
        })()}
      </select>

      {allowCreate && isAdding && (
        <div className="mt-2 space-y-2 border border-[rgba(26,26,26,0.16)] p-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Nueva categoría"
              className="w-full border border-[#1A1A1A]/40 bg-transparent px-2 py-2 font-mono text-[12px] text-noria-text outline-none focus:border-[#647C78]"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreate}
              className="border border-[#647C78] px-3 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-[#647C78]"
            >
              Crear
            </button>
          </div>
          {kind === 'EXPENSE' && (
            <fieldset>
              <legend className="mb-1 font-mono text-[9px] font-[700] uppercase tracking-[0.1em] text-noria-muted">
                Pilar de la categoría
              </legend>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { value: 'NEED', label: 'Necesidad', color: '#B04A3A' },
                  { value: 'WANT', label: 'Deseo', color: '#3F7E95' },
                  { value: 'SAVING', label: 'Ahorro', color: '#4F8F58' },
                ].map(option => {
                  const selected = newPillar === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNewPillar(option.value)}
                      className="border px-1 py-2 font-mono text-[8px] font-[700] uppercase tracking-[0.06em]"
                      style={{
                        borderColor: selected ? option.color : 'rgba(26,26,26,0.28)',
                        color: selected ? option.color : '#6B6862',
                        backgroundColor: selected ? `${option.color}0D` : 'transparent',
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-[11px] font-[500] text-[#9F2F2D]">{error}</p>}
    </div>
  );
}
