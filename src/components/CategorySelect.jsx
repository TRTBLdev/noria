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
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
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
      const id = await db.tags.add({ name, kind });
      onChange(id.toString());
      setNewName('');
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
        <button
          type="button"
          onClick={() => {
            setIsAdding(prev => !prev);
            setError('');
          }}
          className="mb-1 font-mono text-[9px] font-[700] uppercase tracking-[0.12em] text-[#647C78] focus:outline-none"
        >
          {isAdding ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-[#1A1A1A]/40 bg-transparent px-2 py-2 font-mono text-[12px] text-noria-text outline-none focus:border-[#647C78]"
      >
        <option value="">Sin categoría</option>
        {(() => {
          const parentTags = sortedTags.filter(tag => !tag.parentId);
          const subTags = sortedTags.filter(tag => tag.parentId);
          
          return (
            <>
              {parentTags.map(parent => {
                const children = subTags.filter(st => st.parentId === parent.id);
                return (
                  <React.Fragment key={parent.id}>
                    <option value={parent.id}>{parent.name}</option>
                    {children.map(child => (
                      <option key={child.id} value={child.id}>
                        &nbsp;&nbsp;↳ {child.name}
                      </option>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Orphaned subcategories */}
              {subTags.filter(st => !parentTags.some(p => p.id === st.parentId)).map(orphan => (
                <option key={orphan.id} value={orphan.id}>
                  &nbsp;&nbsp;↳ {orphan.name}
                </option>
              ))}
            </>
          );
        })()}
      </select>

      {isAdding && (
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
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
            className="border border-[#1A1A1A] px-3 font-mono text-[10px] font-[700] uppercase tracking-[0.12em] text-noria-text"
          >
            Crear
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-[11px] font-[500] text-[#9F2F2D]">{error}</p>}
    </div>
  );
}
