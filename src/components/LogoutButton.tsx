'use client';

import { useState } from 'react';

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="text-xs text-ink-400 underline disabled:opacity-50"
    >
      退出
    </button>
  );
}
