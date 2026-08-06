'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '加入失败');
        return;
      }
      router.push(`/l/${data.ledgerId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="rounded bg-indigo-600 px-6 py-2 text-white disabled:opacity-50"
      >
        {busy ? '加入中…' : '接受邀请'}
      </button>
    </>
  );
}
