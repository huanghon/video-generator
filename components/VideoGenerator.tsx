'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type User = {
  id: string;
  username: string;
  role: string;
  balance: number;
  status: string;
};

type VideoTask = {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  model: string;
  aspectRatio?: string | null;
  cost: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
};

type ActiveSection = 'image-to-video' | 'text-to-video' | 'history' | 'settings';

type PromptSuggestion = {
  label: string;
  text: string;
};

type GeneratorCopy = {
  title: string;
  subtitle: string;
  promptLabel: string;
  promptDescription: string;
  placeholder: string;
  idleTitle: string;
  idleDescription: string;
  suggestions: PromptSuggestion[];
};

const COST = 12;

const IMAGE_TO_VIDEO_COPY: GeneratorCopy = {
  title: '图生视频 (Image to Video)',
  subtitle: '上传图片、输入提示词，让静态图像生成动态视频。',
  promptLabel: '2. 动态提示词 (Prompt)',
  promptDescription: '描述希望画面产生的运动',
  placeholder: '例如：镜头缓慢推进，树叶在微风中轻轻摇曳，柔和的阳光洒在水面上...',
  idleTitle: '等待生成指令',
  idleDescription: '请在左侧配置参考图与提示词，然后点击下方生成按钮。',
  suggestions: [
    {
      label: '镜头推进',
      text: '镜头缓慢推进，主体细节被放大，周围伴随柔和的虚化效果'
    },
    {
      label: '360度环绕',
      text: '环绕主体进行 360 度低速旋转，展现空间层次和光影变化'
    },
    {
      label: '自然微动',
      text: '角色面部带出轻微笑意，微风吹动发丝，背景有落叶飘下'
    },
    {
      label: '慢动作水花',
      text: '慢镜头下雨滴落在水面，泛起层层涟漪，水花自然溅开'
    }
  ]
};

const TEXT_TO_VIDEO_COPY: GeneratorCopy = {
  title: '文生视频 (Text to Video)',
  subtitle: '输入提示词，让 AI 直接生成动态视频。',
  promptLabel: '1. 视频提示词 (Prompt)',
  promptDescription: '描述希望 AI 直接生成的视频画面',
  placeholder: '例如：一只白色的小猫在阳光明媚的花园里奔跑，电影感镜头，柔和光线，高质量画面...',
  idleTitle: '等待生成指令',
  idleDescription: '请在左侧输入提示词并配置参数，然后点击下方生成按钮。',
  suggestions: [
    { label: '镜头缓慢推进', text: '镜头缓慢推进' },
    { label: '电影感光影', text: '电影感光影' },
    { label: '角色自然运动', text: '角色自然运动' },
    { label: '背景轻微动态', text: '背景轻微动态' }
  ]
};

const HEADER_COPY: Record<ActiveSection, { title: string; subtitle: string }> = {
  'image-to-video': {
    title: IMAGE_TO_VIDEO_COPY.title,
    subtitle: IMAGE_TO_VIDEO_COPY.subtitle
  },
  'text-to-video': {
    title: TEXT_TO_VIDEO_COPY.title,
    subtitle: TEXT_TO_VIDEO_COPY.subtitle
  },
  history: {
    title: '生成历史',
    subtitle: '查看当前账号提交过的生成任务。'
  },
  settings: {
    title: '配置说明',
    subtitle: '查看服务端代理、积分扣费与任务轮询配置。'
  }
};

export default function VideoGenerator({ initialUser }: { initialUser: User }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState(initialUser);
  const [activeSection, setActiveSection] = useState<ActiveSection>('image-to-video');
  const [imagePrompt, setImagePrompt] = useState('');
  const [textPrompt, setTextPrompt] = useState('');
  const [selectedRatio, setSelectedRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [model, setModel] = useState('seedance_2_0');
  const [mode, setMode] = useState('omni_reference');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [renderPercent, setRenderPercent] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [textError, setTextError] = useState('');
  const [textNotice, setTextNotice] = useState('');

  const hasEnoughCredits = user.balance >= COST;
  const isImageToVideo = activeSection === 'image-to-video';
  const isTextToVideo = activeSection === 'text-to-video';
  const isProcessing = isImageToVideo && status === 'processing';

  const currentCopy = isTextToVideo ? TEXT_TO_VIDEO_COPY : IMAGE_TO_VIDEO_COPY;
  const currentPrompt = isTextToVideo ? textPrompt : imagePrompt;
  const currentHeader = HEADER_COPY[activeSection];

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!activeTaskId || status !== 'processing') return undefined;

    const timer = window.setInterval(() => {
      pollTask(activeTaskId);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeTaskId, status]);

  const generatedTasks = useMemo(() => tasks, [tasks]);

  async function refreshMe() {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const result = await response.json();
      if (result.user) setUser(result.user);
    }
  }

  async function loadHistory() {
    const response = await fetch('/api/video/my-tasks');
    if (!response.ok) return;
    const result = await response.json();
    setTasks(result.tasks || []);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function setPromptValue(value: string) {
    if (isTextToVideo) {
      setTextPrompt(value);
      setTextError('');
      setTextNotice('');
      return;
    }

    setImagePrompt(value);
    setError('');
  }

  function switchSection(section: ActiveSection) {
    setActiveSection(section);
    setError('');
    setTextError('');
    setTextNotice('');
    if (section === 'history') {
      loadHistory();
    }
  }

  function handleImageSelect(file?: File | null) {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleImageToVideoGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!hasEnoughCredits) {
      setError('积分不足，请联系管理员充值');
      return;
    }
    if (!imageFile) {
      setError('请先上传参考图');
      return;
    }
    if (!imagePrompt.trim()) {
      setError('请输入动态提示词');
      return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('prompt', imagePrompt.trim());
    formData.append('model', model);
    formData.append('function_mode', mode);
    formData.append('aspectRatio', selectedRatio);
    formData.append('duration', String(duration));

    setStatus('processing');
    setProgress(20);
    setRenderPercent(10);
    setVideoUrl('');

    const response = await fetch('/api/video/generate', {
      method: 'POST',
      body: formData
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus('failed');
      setError(result.message || '提交图生视频任务失败');
      await refreshMe();
      await loadHistory();
      return;
    }

    setActiveTaskId(result.task.id);
    setProgress(35);
    setRenderPercent(20);
    await refreshMe();
    await loadHistory();
    await pollTask(result.task.id);
  }

  function handleTextToVideoGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTextError('');
    setTextNotice('');

    if (!textPrompt.trim()) {
      setTextError('请输入视频提示词');
      return;
    }

    setTextNotice('文生视频接口待接入，当前仅完成页面与参数校验，未提交生成任务。');
  }

  async function pollTask(taskId: string) {
    const response = await fetch(`/api/video/tasks/${taskId}`);
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(result.message || '查询任务状态失败');
      return;
    }

    if (typeof result.balance === 'number') {
      setUser((current) => ({ ...current, balance: result.balance }));
    }

    const task: VideoTask = result.task;
    if (!task) return;

    if (task.status === 'success') {
      setStatus('success');
      setProgress(100);
      setRenderPercent(100);
      setVideoUrl(task.videoUrl || '');
      setActiveTaskId('');
      await loadHistory();
      return;
    }

    if (task.status === 'failed') {
      setStatus('failed');
      setError(task.errorMessage || '图生视频生成失败，本次扣除的积分已自动退还');
      setActiveTaskId('');
      await refreshMe();
      await loadHistory();
      return;
    }

    setStatus('processing');
    setRenderPercent((current) => Math.min(95, current + Math.floor(Math.random() * 8) + 4));
    setProgress((current) => Math.min(96, current + Math.floor(Math.random() * 10) + 4));
  }

  function openTask(task: VideoTask) {
    setImagePrompt(task.prompt);
    setSelectedRatio(task.aspectRatio || '16:9');
    setModel(task.model);
    setVideoUrl(task.videoUrl || '');
    setStatus(task.status === 'success' ? 'success' : task.status === 'failed' ? 'failed' : 'processing');
    switchSection('image-to-video');
  }

  function renderGeneratorForm() {
    return (
      <form onSubmit={isTextToVideo ? handleTextToVideoGenerate : handleImageToVideoGenerate}>
        {isImageToVideo ? (
          <div className="form-group">
            <label className="form-label">
              <span>1. 上传参考图</span>
              <span className="label-desc">支持 JPG, PNG, WEBP 格式</span>
            </label>
            <div className="upload-container" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => handleImageSelect(event.target.files?.[0])}
              />
              {!imagePreview ? (
                <div className="upload-placeholder">
                  <div className="upload-icon">
                    <i className="fa-solid fa-cloud-arrow-up" />
                  </div>
                  <h3>
                    拖拽图片至此处，或 <span>点击上传</span>
                  </h3>
                  <p>建议比例 16:9 或 9:16，文件大小不超过 10MB</p>
                </div>
              ) : (
                <div className="upload-preview-container">
                  <img className="upload-preview-img" src={imagePreview} alt="Preview" />
                  <button
                    type="button"
                    className="remove-btn"
                    title="清除图片"
                    onClick={(event) => {
                      event.stopPropagation();
                      setImagePreview('');
                      setImageFile(null);
                    }}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="form-group">
          <label className="form-label" htmlFor={`${activeSection}-prompt-input`}>
            <span>{currentCopy.promptLabel}</span>
            <span className="label-desc">{currentCopy.promptDescription}</span>
          </label>
          <textarea
            id={`${activeSection}-prompt-input`}
            value={currentPrompt}
            onChange={(event) => setPromptValue(event.target.value)}
            placeholder={currentCopy.placeholder}
            required
          />
          <div className="prompt-suggestions">
            {currentCopy.suggestions.map((suggestion) => (
              <button
                className="suggestion-tag"
                key={suggestion.label}
                type="button"
                onClick={() => setPromptValue(suggestion.text)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>

        <div className="parameters-grid">
          <div className="form-group">
            <label className="form-label" htmlFor={`${activeSection}-model-select`}>
              核心生成模型
            </label>
            <div className="select-wrapper">
              <select
                id={`${activeSection}-model-select`}
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                <option value="seedance_2_0">Seedance 2.0 (精细画质 - 消耗 12 积分)</option>
                <option value="seedance_2_0_fast">Seedance 2.0 Fast (速度优先 - 消耗 12 积分)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${activeSection}-mode-select`}>
              运动控制模式
            </label>
            <div className="select-wrapper">
              <select
                id={`${activeSection}-mode-select`}
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="omni_reference">Omni Reference (全景自适应参考)</option>
                <option value="first_last_frames">First-Last Frames (首尾帧过渡)</option>
              </select>
            </div>
          </div>

          <div className="form-group full-width">
            <label className="form-label">画面纵横比</label>
            <div className="ratio-selector-grid">
              {['16:9', '9:16', '1:1', '4:3'].map((ratio) => (
                <button
                  type="button"
                  key={ratio}
                  className={`ratio-btn ${selectedRatio === ratio ? 'active' : ''}`}
                  onClick={() => setSelectedRatio(ratio)}
                >
                  <div className={`ratio-box r-${ratio.replace(':', '-')}`} />
                  <span>{ratio}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group full-width">
            <div className="slider-label">
              <label className="form-label">视频时长 (秒)</label>
              <span className="slider-value">{duration}s</span>
            </div>
            <input
              type="range"
              min="4"
              max="15"
              value={duration}
              className="slider"
              onChange={(event) => setDuration(Number(event.target.value))}
            />
            <div className="slider-ticks">
              <span>4s</span>
              <span>6s</span>
              <span>8s</span>
              <span>10s</span>
              <span>12s</span>
              <span>15s</span>
            </div>
          </div>
        </div>

        {isImageToVideo && !hasEnoughCredits ? (
          <p className="insufficient-credit">积分不足，请联系管理员充值</p>
        ) : null}
        {isImageToVideo && error ? <p className="error-message">{error}</p> : null}
        {isTextToVideo && textError ? <p className="error-message">{textError}</p> : null}
        {isTextToVideo && textNotice ? <p className="success-message">{textNotice}</p> : null}

        <button
          className="submit-btn"
          type="submit"
          disabled={isImageToVideo ? !hasEnoughCredits || isProcessing : false}
        >
          <span className="btn-text">
            {isImageToVideo
              ? isProcessing
                ? '生成中...'
                : `立即生成视频，消耗 ${COST} 积分`
              : '立即生成视频'}
          </span>
          <span className="btn-icon">
            <i className="fa-solid fa-play" />
          </span>
        </button>
      </form>
    );
  }

  function renderPreviewPanel() {
    const previewStatus = isTextToVideo ? 'idle' : status;

    return (
      <div className="panel-card preview-panel">
        <div className="panel-header">
          <h3>实时生成预览</h3>
          <span className={`preview-badge status-${previewStatus === 'success' ? 'ready' : previewStatus}`}>
            {previewStatus === 'idle' ? 'Idle' : previewStatus}
          </span>
        </div>

        <div className="preview-container">
          {isTextToVideo ? (
            <div className="preview-state state-idle">
              <div className="pulse-ring">
                <i className="fa-solid fa-photo-film" />
              </div>
              <h4>{TEXT_TO_VIDEO_COPY.idleTitle}</h4>
              <p>{TEXT_TO_VIDEO_COPY.idleDescription}</p>
            </div>
          ) : null}

          {isImageToVideo && (status === 'idle' || status === 'failed') ? (
            <div className="preview-state state-idle">
              <div className="pulse-ring">
                <i className="fa-solid fa-photo-film" />
              </div>
              <h4>{status === 'failed' ? '生成未完成' : IMAGE_TO_VIDEO_COPY.idleTitle}</h4>
              <p>{error || IMAGE_TO_VIDEO_COPY.idleDescription}</p>
            </div>
          ) : null}

          {isImageToVideo && status === 'processing' ? (
            <div className="preview-state state-processing">
              <div className="loader-circle" />
              <div className="processing-steps">
                <div className="step-item completed">
                  <span className="step-dot" />
                  <span className="step-name">图片上传与任务扣费完成</span>
                  <span className="step-percent">100%</span>
                </div>
                <div className="step-item completed">
                  <span className="step-dot" />
                  <span className="step-name">提交任务队列...</span>
                </div>
                <div className="step-item active">
                  <span className="step-dot" />
                  <span className="step-name">云端 GPU 视频渲染中...</span>
                  <span className="step-percent">{renderPercent}%</span>
                </div>
              </div>
              <div className="progress-bar-container">
                <div className="main-progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <span className="time-estimate">正在轮询任务状态，完成后会自动展示视频</span>
            </div>
          ) : null}

          {isImageToVideo && status === 'success' ? (
            <div className="preview-state state-success">
              <div className="video-wrapper">
                <video src={videoUrl} controls preload="auto" width="100%" />
              </div>
              <div className="success-actions">
                <a href={videoUrl} className="action-btn download-btn" download>
                  <i className="fa-solid fa-download" /> 下载 MP4 视频
                </a>
                <button
                  type="button"
                  className="action-btn secondary-btn"
                  onClick={() => {
                    setStatus('idle');
                    setVideoUrl('');
                    setError('');
                  }}
                >
                  <i className="fa-solid fa-arrows-rotate" /> 重新生成
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-icon">
              <i className="fa-solid fa-wand-magic-sparkles" />
            </div>
            <div className="brand-text">
              <h2>AI Video Studio</h2>
              <span>Enterprise Portal</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeSection === 'image-to-video' ? 'active' : ''}`}
              type="button"
              onClick={() => switchSection('image-to-video')}
            >
              <i className="fa-solid fa-image" />
              <span>图生视频</span>
            </button>
            <button
              className={`nav-item ${activeSection === 'text-to-video' ? 'active' : ''}`}
              type="button"
              onClick={() => switchSection('text-to-video')}
            >
              <i className="fa-solid fa-film" />
              <span>文生视频</span>
            </button>
            <button
              className={`nav-item ${activeSection === 'history' ? 'active' : ''}`}
              type="button"
              onClick={() => switchSection('history')}
            >
              <i className="fa-solid fa-folder-open" />
              <span>生成历史</span>
            </button>
            <button
              className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`}
              type="button"
              onClick={() => switchSection('settings')}
            >
              <i className="fa-solid fa-sliders" />
              <span>配置说明</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">
              <i className="fa-solid fa-user-tie" />
            </div>
            <div className="user-info">
              <span className="username">{user.username}</span>
              <span className="role">{user.role === 'admin' ? '管理员' : '创意制作组'}</span>
            </div>
          </div>
          <div className="credits-card">
            <div className="credits-header">
              <span>可用积分</span>
              <i className="fa-solid fa-coins font-glow" />
            </div>
            <div className="credits-val">{user.balance.toLocaleString()}</div>
            <div className="credits-progress-bar">
              <div className="progress" style={{ width: `${Math.min(100, user.balance)}%` }} />
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div className="page-title">
            <h1>{currentHeader.title}</h1>
            <p>{currentHeader.subtitle}</p>
          </div>
          <div className="top-actions">
            <div className="user-chip">
              <i className="fa-solid fa-user" />
              <strong>{user.username}</strong>
              <span className="balance-pill">{user.balance} 积分</span>
            </div>
            {user.role === 'admin' ? (
              <Link className="header-link" href="/admin">
                <i className="fa-solid fa-shield-halved" /> 后台
              </Link>
            ) : null}
            <button className="logout-btn" type="button" onClick={handleLogout}>
              <i className="fa-solid fa-arrow-right-from-bracket" /> 退出
            </button>
          </div>
        </header>

        {isImageToVideo || isTextToVideo ? (
          <section className="studio-panel">
            <div className="panel-card input-panel">{renderGeneratorForm()}</div>
            {renderPreviewPanel()}
          </section>
        ) : null}

        {activeSection === 'history' ? (
          <section className="history-panel">
            <div className="panel-header">
              <div className="header-left">
                <h2>我的生成历史</h2>
                <p>当前账号提交过的生成任务都会保存在这里。</p>
              </div>
              <button className="clear-history-btn" type="button" onClick={loadHistory}>
                <i className="fa-solid fa-rotate" /> 刷新
              </button>
            </div>

            <div className="history-grid">
              {generatedTasks.map((task) => (
                <article className="history-card" key={task.id}>
                  <div className="card-thumbnail" onClick={() => openTask(task)}>
                    {task.imageUrl ? <img src={task.imageUrl} alt="Thumbnail" /> : null}
                    <div className="play-overlay">
                      <div className="play-overlay-icon">
                        <i className="fa-solid fa-play" />
                      </div>
                    </div>
                    <span className={`card-badge status-badge ${task.status}`}>{task.status}</span>
                  </div>
                  <div className="card-details">
                    <p className="card-prompt">{task.errorMessage || task.prompt}</p>
                    <div className="card-meta">
                      <div className="card-meta-left">
                        <span>{task.aspectRatio || '16:9'}</span>
                        <span>{task.cost} 积分</span>
                      </div>
                      <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="card-actions">
                      <button className="card-action-btn" type="button" onClick={() => openTask(task)}>
                        <i className="fa-solid fa-eye" />
                      </button>
                      {task.videoUrl ? (
                        <a className="card-action-btn" href={task.videoUrl} download>
                          <i className="fa-solid fa-download" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeSection === 'settings' ? (
          <section className="settings-panel">
            <div className="panel-card settings-card">
              <h2>后端接口配置</h2>
              <p className="subtitle">
                第三方视频 API Key 只在服务端环境变量中读取，不会出现在浏览器代码里。
              </p>
              <hr className="divider" />
              <div className="form-group">
                <label className="form-label">
                  <span>积分扣费规则</span>
                  <span className="label-desc">Seedance 2.0 固定消耗</span>
                </label>
                <input value={`${COST} 积分 / 次`} disabled readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">
                  <span>任务状态</span>
                  <span className="label-desc">通过后端代理轮询</span>
                </label>
                <input value="POST /api/video/generate · GET /api/video/tasks/:id" disabled readOnly />
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
