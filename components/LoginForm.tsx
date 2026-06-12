'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(result.message || '登录失败');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-icon">
            <i className="fa-solid fa-wand-magic-sparkles" />
          </div>
          <div className="brand-text">
            <h2>AI Video Studio</h2>
            <span>Secure Portal</span>
          </div>
        </div>

        <div className="auth-title">
          <h1>登录工作台</h1>
          <p>请输入管理员分配的账号。系统不开放自助注册。</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-group">
            <span className="form-label">用户名</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin / user1"
              required
            />
          </label>

          <label className="form-group">
            <span className="form-label">密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
            />
          </label>

          {error ? <p className="error-message">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            <i className="fa-solid fa-right-to-bracket" />
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
