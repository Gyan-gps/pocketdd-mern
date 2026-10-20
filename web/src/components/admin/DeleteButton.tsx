'use client';

import { useTransition } from 'react';
import { deleteEntry } from '@/app/pocketddadmin/(panel)/[entity]/actions';

export function DeleteButton({ entity, id }: { entity: string; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-link btn-danger"
      disabled={pending}
      onClick={() => {
        // Backpack: "Are you sure you want to delete this item?"
        if (confirm('Are you sure you want to delete this item?')) start(() => deleteEntry(entity, id));
      }}
    >
      Delete
    </button>
  );
}
