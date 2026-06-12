document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let uploadedImageBase64 = null;
  let generationInterval = null;
  let currentGeneratingTask = null;
  const historyStorageKey = 'video_generator_history';
  let historyItems = JSON.parse(localStorage.getItem(historyStorageKey)) || [
    {
      id: 'task_001',
      prompt: '镜头缓慢前推，主体细节被放大，周围伴随柔和的虚化效果，赛博朋克霓虹街道夜景',
      thumbnail: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=400&q=80',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-at-night-42289-large.mp4',
      ratio: '16:9',
      duration: 5,
      model: 'Seedance 2.0',
      timestamp: '2026-06-09 10:14'
    },
    {
      id: 'task_002',
      prompt: '慢镜头下雨滴落在水洼中泛起层层涟漪，水花四溅，宏伟未来科幻都市日落',
      thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&q=80',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-futuristic-city-with-neon-lights-and-flying-cars-41484-large.mp4',
      ratio: '16:9',
      duration: 8,
      model: 'Seedance 2.0 Fast',
      timestamp: '2026-06-09 09:45'
    }
  ];

  // Save initial default history if none exists
  if (!localStorage.getItem(historyStorageKey)) {
    localStorage.setItem(historyStorageKey, JSON.stringify(historyItems));
  }

  // --- DOM Elements ---
  // Navigation Buttons
  const navBtnGenerator = document.getElementById('nav-btn-generator');
  const navBtnHistory = document.getElementById('nav-btn-history');
  const navBtnSettings = document.getElementById('nav-btn-settings');
  
  // Sections
  const sectionGenerator = document.getElementById('section-generator');
  const sectionHistory = document.getElementById('section-history');
  const sectionSettings = document.getElementById('section-settings');

  // Image Upload Elements
  const dropZone = document.getElementById('drop-zone');
  const imageUploadInput = document.getElementById('image-upload-input');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const uploadPreviewContainer = document.getElementById('upload-preview-container');
  const uploadPreviewImg = document.getElementById('upload-preview-img');
  const removeImageBtn = document.getElementById('remove-image-btn');

  // Input Controls
  const promptInput = document.getElementById('prompt-input');
  const suggestionTags = document.querySelectorAll('.suggestion-tag');
  const durationSlider = document.getElementById('duration-slider');
  const durationVal = document.getElementById('duration-val');
  const ratioButtons = document.querySelectorAll('.ratio-btn');
  const modelSelect = document.getElementById('model-select');
  const modeSelect = document.getElementById('mode-select');
  const generatorForm = document.getElementById('generator-form');

  // Preview States
  const previewStatusBadge = document.getElementById('preview-status-badge');
  const previewStateIdle = document.getElementById('preview-state-idle');
  const previewStateProcessing = document.getElementById('preview-state-processing');
  const previewStateSuccess = document.getElementById('preview-state-success');
  const cancelTaskBtn = document.getElementById('cancel-task-btn');
  
  // Process logs & progress
  const stepUpload = document.getElementById('step-upload');
  const uploadPercent = document.getElementById('upload-percent');
  const stepApi = document.getElementById('step-api');
  const stepRender = document.getElementById('step-render');
  const renderPercent = document.getElementById('render-percent');
  const generationProgress = document.getElementById('generation-progress');
  const timeLeftDisplay = document.getElementById('time-left');
  
  // Success state video
  const videoPlayer = document.getElementById('output-video-player');
  const downloadVideoBtn = document.getElementById('download-video-btn');
  const regenerateBtn = document.getElementById('regenerate-btn');

  // History Elements
  const historyItemsGrid = document.getElementById('history-items-grid');
  const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');

  // Settings Elements
  const settingsForm = document.getElementById('settings-form');
  const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
  const apiKeyInput = document.getElementById('setting-api-key');
  const creditDisplay = document.getElementById('credit-display');

  // --- 1. Navigation Controller ---
  function switchSection(activeNavBtn, targetSection) {
    // Reset all buttons and sections
    [navBtnGenerator, navBtnHistory, navBtnSettings].forEach(btn => btn.classList.remove('active'));
    [sectionGenerator, sectionHistory, sectionSettings].forEach(sec => sec.style.display = 'none');
    
    // Activate current
    activeNavBtn.classList.add('active');
    targetSection.style.display = targetSection === sectionGenerator ? 'grid' : 'flex';
    
    // Refresh history grid if clicked history
    if (targetSection === sectionHistory) {
      renderHistoryGrid();
    }
  }

  navBtnGenerator.addEventListener('click', (e) => {
    e.preventDefault();
    switchSection(navBtnGenerator, sectionGenerator);
  });
  
  navBtnHistory.addEventListener('click', (e) => {
    e.preventDefault();
    switchSection(navBtnHistory, sectionHistory);
  });
  
  navBtnSettings.addEventListener('click', (e) => {
    e.preventDefault();
    switchSection(navBtnSettings, sectionSettings);
  });

  // --- 2. Image Upload Handler ---
  // Trigger file dialog
  dropZone.addEventListener('click', (e) => {
    if (e.target !== removeImageBtn && !removeImageBtn.contains(e.target)) {
      imageUploadInput.click();
    }
  });

  // Handle drag over
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  // Handle drop
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageFile(files[0]);
    }
  });

  // File input change
  imageUploadInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Remove uploaded image
  removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetImageUpload();
  });

  function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件！');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImageBase64 = e.target.result;
      uploadPreviewImg.src = uploadedImageBase64;
      uploadPlaceholder.style.display = 'none';
      uploadPreviewContainer.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }

  function resetImageUpload() {
    uploadedImageBase64 = null;
    imageUploadInput.value = '';
    uploadPreviewImg.src = '';
    uploadPlaceholder.style.display = 'flex';
    uploadPreviewContainer.style.display = 'none';
  }

  // --- 3. Input Controllers & Suggestions ---
  // Prompt Suggestions tags
  suggestionTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const text = tag.getAttribute('data-text');
      promptInput.value = text;
      // Focus textarea
      promptInput.focus();
    });
  });

  // Aspect ratio selectors
  let selectedRatio = '16:9';
  ratioButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      ratioButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRatio = btn.getAttribute('data-ratio');
    });
  });

  // Duration Slider
  durationSlider.addEventListener('input', (e) => {
    durationVal.textContent = `${e.target.value}s`;
  });

  // --- 4. Generation Pipeline & Real API Call ---
  generatorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const file = imageUploadInput.files[0];
    if (!file && !uploadedImageBase64) {
      alert('请上传一张图片作为参考图！');
      return;
    }

    startRealGeneration(file);
  });

  function startRealGeneration(file) {
    // 1. Reset preview UI states
    previewStateIdle.style.display = 'none';
    previewStateSuccess.style.display = 'none';
    previewStateProcessing.style.display = 'flex';
    
    previewStatusBadge.textContent = 'Generating';
    previewStatusBadge.className = 'preview-badge status-generating';
    
    resetStepStates();
    timeLeftDisplay.textContent = '计算中...';

    // 2. Build Multipart FormData
    const formData = new FormData();
    if (file) {
      formData.append('image', file);
    } else if (uploadedImageBase64) {
      const blob = dataURItoBlob(uploadedImageBase64);
      formData.append('image', blob, 'image.png');
    }
    
    formData.append('prompt', promptInput.value);
    formData.append('model', modelSelect.value);
    formData.append('function_mode', modeSelect.value);
    formData.append('ratio', selectedRatio);
    formData.append('duration', durationSlider.value);

    // 3. Post to backend with XHR to track file upload progress
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/generate-video', true);
    
    // Monitor upload progress (Step 1)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        uploadPercent.textContent = `${percent}%`;
        generationProgress.style.width = `${percent * 0.25}%`; // First 25% for upload progress
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.code === 200 && response.data && response.data.task_id) {
            setStepComplete(stepUpload);
            setStepActive(stepApi);
            
            const taskId = response.data.task_id;
            currentGeneratingTask = taskId;
            
            // Step 2: Contacting API is finished, proceed to GPU Rendering
            setTimeout(() => {
              setStepComplete(stepApi);
              setStepActive(stepRender);
              pollTaskStatus(taskId);
            }, 1000);
            
          } else {
            alert('提交失败: ' + (response.message || '视频接口未知异常'));
            stopGeneration();
          }
        } catch (e) {
          alert('解析接口数据失败！');
          stopGeneration();
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          alert('请求出错: ' + (errRes.message || xhr.statusText));
        } catch (e) {
          alert('服务端异常，错误码: ' + xhr.status);
        }
        stopGeneration();
      }
    };

    xhr.onerror = () => {
      alert('无法连接至后台服务器，请确认后端 Node.js 服务已正常运行。');
      stopGeneration();
    };

    xhr.send(formData);
  }

  function pollTaskStatus(taskId) {
    let elapsedSeconds = 0;
    const duration = parseInt(durationSlider.value);
    const estimatedTotalSeconds = duration + 10;
    timeLeftDisplay.textContent = `${estimatedTotalSeconds}秒`;
    
    let renderProgressVal = 0;

    generationInterval = setInterval(async () => {
      elapsedSeconds += 2;
      let timeLeft = estimatedTotalSeconds - elapsedSeconds;
      if (timeLeft < 3) timeLeft = 3;
      timeLeftDisplay.textContent = `${timeLeft}秒`;
      
      // Visual progression indicator
      renderProgressVal += Math.floor(Math.random() * 8) + 3;
      if (renderProgressVal > 95) renderProgressVal = 95;
      renderPercent.textContent = `${renderProgressVal}%`;
      generationProgress.style.width = `${30 + (renderProgressVal * 0.7)}%`; // Map 30% - 100%

      try {
        const res = await fetch(`/api/task-status?task_id=${taskId}`);
        const result = await res.json();
        
        if (result.code === 200 && result.data) {
          const status = result.data.status;
          
          if (status === 'succeeded') {
            clearInterval(generationInterval);
            renderPercent.textContent = '100%';
            generationProgress.style.width = '100%';
            setStepComplete(stepRender);
            
            const videoUrl = result.data.result.video_url;
            const modelName = modelSelect.options[modelSelect.selectedIndex].text.split(' ')[0];
            finishRealGeneration(promptInput.value, modelName, duration, videoUrl);
          } 
          else if (status === 'failed') {
            clearInterval(generationInterval);
            alert('视频生成失败！视频接口错误：' + (result.data.result?.error_message || '未知渲染错误'));
            stopGeneration();
          }
        }
      } catch (error) {
        console.error('轮询状态异常:', error);
      }
    }, 2000);
  }

  function finishRealGeneration(prompt, model, duration, videoUrl) {
    previewStatusBadge.textContent = 'Ready';
    previewStatusBadge.className = 'preview-badge status-ready';

    // Update video player
    videoPlayer.src = videoUrl;
    videoPlayer.load();
    downloadVideoBtn.href = videoUrl;

    // Switch to success card
    previewStateProcessing.style.display = 'none';
    previewStateSuccess.style.display = 'flex';

    // Save history
    const newHistoryItem = {
      id: 'task_' + Date.now(),
      prompt: prompt,
      thumbnail: uploadedImageBase64 || 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=400&q=80',
      videoUrl: videoUrl,
      ratio: selectedRatio,
      duration: duration,
      model: model,
      timestamp: getFormattedTime()
    };

    historyItems.unshift(newHistoryItem);
    localStorage.setItem(historyStorageKey, JSON.stringify(historyItems));

    // Update credit display
    updateCreditsBalance();
  }

  function resetStepStates() {
    [stepUpload, stepApi, stepRender].forEach(el => {
      el.className = 'step-item';
    });
    uploadPercent.textContent = '0%';
    renderPercent.textContent = '0%';
    generationProgress.style.width = '0%';
    stepUpload.classList.add('active');
  }

  function setStepActive(element) {
    element.classList.add('active');
  }

  function setStepComplete(element) {
    element.classList.remove('active');
    element.classList.add('complete');
  }

  // Cancel task handler
  cancelTaskBtn.addEventListener('click', () => {
    if (confirm('确认要取消当前的视频生成任务吗？')) {
      stopGeneration();
    }
  });

  function stopGeneration() {
    clearInterval(generationInterval);
    previewStateProcessing.style.display = 'none';
    previewStateIdle.style.display = 'flex';
    previewStatusBadge.textContent = 'Idle';
    previewStatusBadge.className = 'preview-badge';
  }

  regenerateBtn.addEventListener('click', () => {
    const file = imageUploadInput.files[0];
    if (file || uploadedImageBase64) {
      startRealGeneration(file);
    } else {
      alert('无法重新生成，当前未上传任何参考图片。');
    }
  });

  // --- 5. History Render & Interactions ---
  function renderHistoryGrid() {
    historyItemsGrid.innerHTML = '';
    
    if (historyItems.length === 0) {
      historyItemsGrid.innerHTML = `
        <div class="state-idle" style="grid-column: 1 / -1; margin: 40px auto;">
          <div class="pulse-ring"><i class="fa-solid fa-folder-open"></i></div>
          <h4>暂无生成历史</h4>
          <p>历史生成的视频将会保存在此处，您可以随时查看和下载。</p>
        </div>
      `;
      return;
    }

    historyItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      card.innerHTML = `
        <div class="card-thumbnail" data-video="${item.videoUrl}">
          <img src="${item.thumbnail}" alt="Thumbnail" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="thumbnail-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:linear-gradient(135deg, #1f2937, #111827); color:var(--text-muted); position:absolute; top:0; left:0;">
            <i class="fa-solid fa-image" style="font-size:2rem;"></i>
          </div>
          <div class="play-overlay">
            <div class="play-overlay-icon"><i class="fa-solid fa-play"></i></div>
          </div>
          <span class="card-badge">${item.duration}s</span>
        </div>
        <div class="card-details">
          <p class="card-prompt" title="${item.prompt}">${item.prompt}</p>
          <div class="card-meta">
            <div class="card-meta-left">
              <span>${item.ratio}</span>
              <span>${item.model}</span>
            </div>
            <span>${item.timestamp}</span>
          </div>
          <div class="card-actions">
            <a href="${item.videoUrl}" class="card-action-btn download" download title="下载视频">
              <i class="fa-solid fa-arrow-down"></i>
            </a>
            <button type="button" class="card-action-btn play" title="载入播放器" data-video="${item.videoUrl}">
              <i class="fa-solid fa-expand"></i>
            </button>
            <button type="button" class="card-action-btn delete" data-id="${item.id}" title="删除记录">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
      
      // Click thumbnail to play video
      const thumb = card.querySelector('.card-thumbnail');
      thumb.addEventListener('click', () => {
        playHistoryVideo(item);
      });

      // Play button action
      const playBtn = card.querySelector('.card-action-btn.play');
      playBtn.addEventListener('click', () => {
        playHistoryVideo(item);
      });

      // Delete action
      const deleteBtn = card.querySelector('.card-action-btn.delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确认删除这条历史记录吗？')) {
          deleteHistoryItem(item.id);
        }
      });

      historyItemsGrid.appendChild(card);
    });
  }

  function playHistoryVideo(item) {
    uploadedImageBase64 = item.thumbnail;
    uploadPreviewImg.src = item.thumbnail;
    uploadPlaceholder.style.display = 'none';
    uploadPreviewContainer.style.display = 'flex';

    promptInput.value = item.prompt;
    
    // Set ratio btn
    ratioButtons.forEach(btn => {
      if (btn.getAttribute('data-ratio') === item.ratio) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    selectedRatio = item.ratio;

    // Set model
    if (item.model.includes('Fast')) {
      modelSelect.value = 'seedance_2_0_fast';
    } else {
      modelSelect.value = 'seedance_2_0';
    }

    // Set duration
    durationSlider.value = item.duration;
    durationVal.textContent = `${item.duration}s`;

    // Load video player
    videoPlayer.src = item.videoUrl;
    videoPlayer.load();
    downloadVideoBtn.href = item.videoUrl;

    previewStateIdle.style.display = 'none';
    previewStateProcessing.style.display = 'none';
    previewStateSuccess.style.display = 'flex';
    previewStatusBadge.textContent = 'Ready';
    previewStatusBadge.className = 'preview-badge status-ready';

    switchSection(navBtnGenerator, sectionGenerator);
  }

  function deleteHistoryItem(id) {
    historyItems = historyItems.filter(item => item.id !== id);
    localStorage.setItem(historyStorageKey, JSON.stringify(historyItems));
    renderHistoryGrid();
  }

  clearAllHistoryBtn.addEventListener('click', () => {
    if (confirm('确认清空所有本地历史记录吗？此操作无法撤销。')) {
      historyItems = [];
      localStorage.setItem(historyStorageKey, JSON.stringify(historyItems));
      renderHistoryGrid();
    }
  });

  // --- 6. Settings Operations ---
  toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    
    const icon = toggleKeyVisibility.querySelector('i');
    icon.className = isPassword ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  });

  // Save Settings
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('配置已成功保存！后端服务已被配置更新。');
    switchSection(navBtnGenerator, sectionGenerator);
  });

  // --- 7. Helper Utilities & Balance fetcher ---
  async function updateCreditsBalance() {
    try {
      const res = await fetch('/api/credits');
      const result = await res.json();
      if (result.code === 200 && result.data) {
        const available = result.data.api_available_credits;
        const total = result.data.api_total_credits;
        
        creditDisplay.textContent = available.toLocaleString();
        
        const progressEl = document.querySelector('.credits-progress-bar .progress');
        if (progressEl && total > 0) {
          const pct = Math.min(100, (available / total) * 100);
          progressEl.style.width = `${pct}%`;
        }
      }
    } catch (error) {
      console.error('获取额度失败:', error);
    }
  }

  function getFormattedTime() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], {type: mimeString});
  }

  // Initial Credit Balance Fetch
  updateCreditsBalance();
});
