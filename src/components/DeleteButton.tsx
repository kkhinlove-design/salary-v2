'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteButtonProps {
  onDelete: () => Promise<void>;
  confirmMessage?: string;
}

export default function DeleteButton({ onDelete, confirmMessage = '정말 삭제하시겠습니까?' }: DeleteButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm(confirmMessage)) return;
    setLoading(true);
    try {
      await onDelete();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
      title="삭제"
    >
      {loading ? <span className="text-xs">...</span> : <Trash2 size={14} />}
    </button>
  );
}
