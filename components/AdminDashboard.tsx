'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type User = {
  id: string;
  username: string;
  role: string;
  balance: number;
  status: string;
  createdAt: string;
};

type CreditLog = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  beforeBalance: number;
  afterBalance: number;
  reason?: string | null;
  createdAt: string;
  user?: { username: string };
  operator?: { username: string } | null;
};

type VideoTask = {
  id: string;
  prompt: string;
  model: string;
  cost: number;
  status: string;
  videoUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  user?: { username: string };
};

type Props = {
  initialUser: {
    username: string;
    role: string;
  };
};

export default function AdminDashboard({ initialUser }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<CreditLog[]>([]);
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'tasks'>('users');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'user',
    balance: 100
  });

  async function fetchJson(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || '请求失败');
    }
    return result;
  }

  async function refreshAll() {
    const [usersResult, logsResult, tasksResult] = await Promise.all([
      fetchJson('/api/admin/users'),
      fetchJson('/api/admin/credit-logs'),
      fetchJson('/api/admin/video-tasks')
    ]);
    setUsers(usersResult.users || []);
    setLogs(logsResult.logs || []);
    setTasks(tasksResult.tasks || []);
  }

  useEffect(() => {
    refreshAll().catch((err) => setError(err.message));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await fetchJson('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      setNewUser({ username: '', password: '', role: 'user', balance: 100 });
      setMessage('用户已创建');
      await refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function updateUser(id: string, data: Record<string, string>) {
    setError('');
    setMessage('');
    try {
      await fetchJson(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      setMessage('用户已更新');
      await refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function changeCredits(id: string, action: string, amount: number) {
    setError('');
    setMessage('');
    try {
      await fetchJson(`/api/admin/users/${id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount, reason: '管理员后台操作' })
      });
      setMessage('积分已更新');
      await refreshAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const totals = useMemo(
    () => ({
      users: users.length,
      active: users.filter((user) => user.status === 'active').length,
      balance: users.reduce((sum, user) => sum + user.balance, 0)
    }),
    [users]
  );

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>管理员后台</h1>
          <p>
            当前管理员：{initialUser.username} · 用户 {totals.users} 人 · 启用 {totals.active} 人 ·
            总积分 {totals.balance}
          </p>
        </div>
        <div className="top-actions">
          <Link className="header-link" href="/">
            <i className="fa-solid fa-video" /> 返回工作台
          </Link>
          <button className="logout-btn" type="button" onClick={handleLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket" /> 退出
          </button>
        </div>
      </header>

      {message ? <p className="success-message">{message}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      <section className="admin-grid">
        <aside className="admin-panel">
          <h2>新增用户</h2>
          <form className="admin-form" onSubmit={handleCreateUser}>
            <input
              value={newUser.username}
              onChange={(event) => setNewUser({ ...newUser, username: event.target.value })}
              placeholder="用户名"
              required
            />
            <input
              type="password"
              value={newUser.password}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
              placeholder="初始密码"
              required
            />
            <select
              value={newUser.role}
              onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <input
              type="number"
              min="0"
              value={newUser.balance}
              onChange={(event) => setNewUser({ ...newUser, balance: Number(event.target.value) })}
              placeholder="初始积分"
            />
            <button className="auth-submit" type="submit">
              <i className="fa-solid fa-user-plus" /> 创建用户
            </button>
          </form>
        </aside>

        <section className="admin-panel">
          <div className="admin-tabs">
            <button
              className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab('users')}
            >
              用户列表
            </button>
            <button
              className={`admin-tab ${activeTab === 'logs' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab('logs')}
            >
              积分流水
            </button>
            <button
              className={`admin-tab ${activeTab === 'tasks' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab('tasks')}
            >
              视频记录
            </button>
          </div>

          {activeTab === 'users' ? (
            <UsersTable users={users} onUpdateUser={updateUser} onChangeCredits={changeCredits} />
          ) : null}
          {activeTab === 'logs' ? <CreditLogsTable logs={logs} /> : null}
          {activeTab === 'tasks' ? <VideoTasksTable tasks={tasks} /> : null}
        </section>
      </section>
    </main>
  );
}

function UsersTable({
  users,
  onUpdateUser,
  onChangeCredits
}: {
  users: User[];
  onUpdateUser: (id: string, data: Record<string, string>) => Promise<void>;
  onChangeCredits: (id: string, action: string, amount: number) => Promise<void>;
}) {
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [creditAmounts, setCreditAmounts] = useState<Record<string, number>>({});

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>username</th>
            <th>role</th>
            <th>balance</th>
            <th>status</th>
            <th>createdAt</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const amount = creditAmounts[user.id] ?? 0;
            return (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.role}</td>
                <td>{user.balance}</td>
                <td>
                  <span className={`status-badge ${user.status}`}>{user.status}</span>
                </td>
                <td>{new Date(user.createdAt).toLocaleString()}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() =>
                        onUpdateUser(user.id, {
                          status: user.status === 'active' ? 'disabled' : 'active'
                        })
                      }
                    >
                      {user.status === 'active' ? '禁用' : '启用'}
                    </button>
                    <input
                      className="mini-input"
                      type="password"
                      value={passwords[user.id] || ''}
                      onChange={(event) =>
                        setPasswords({ ...passwords, [user.id]: event.target.value })
                      }
                      placeholder="新密码"
                    />
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => onUpdateUser(user.id, { password: passwords[user.id] || '' })}
                      disabled={!passwords[user.id]}
                    >
                      改密
                    </button>
                    <input
                      className="mini-input"
                      type="number"
                      min="0"
                      value={amount}
                      onChange={(event) =>
                        setCreditAmounts({ ...creditAmounts, [user.id]: Number(event.target.value) })
                      }
                    />
                    <button className="mini-btn" type="button" onClick={() => onChangeCredits(user.id, 'add', amount)}>
                      加分
                    </button>
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => onChangeCredits(user.id, 'deduct', amount)}
                    >
                      扣分
                    </button>
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => onChangeCredits(user.id, 'reset', amount)}
                    >
                      重置
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreditLogsTable({ logs }: { logs: CreditLog[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>类型</th>
            <th>数量</th>
            <th>变化</th>
            <th>原因</th>
            <th>操作人</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{log.user?.username || log.userId}</td>
              <td>{log.type}</td>
              <td>{log.amount}</td>
              <td>
                {log.beforeBalance} → {log.afterBalance}
              </td>
              <td>{log.reason || '-'}</td>
              <td>{log.operator?.username || '-'}</td>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VideoTasksTable({ tasks }: { tasks: VideoTask[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>状态</th>
            <th>模型</th>
            <th>积分</th>
            <th>提示词</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.user?.username || '-'}</td>
              <td>
                <span className={`status-badge ${task.status}`}>{task.status}</span>
              </td>
              <td>{task.model}</td>
              <td>{task.cost}</td>
              <td>{task.errorMessage || task.prompt}</td>
              <td>{new Date(task.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
