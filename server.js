const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer config for local file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Serve static portal files
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Configurations
const PORT = process.env.PORT || 3000;
const VIDEO_API_KEY = process.env.VIDEO_API_KEY || '';
const VIDEO_API_BASE_URL = process.env.VIDEO_API_BASE_URL || '';
const hasLiveApiConfig = Boolean(VIDEO_API_KEY && VIDEO_API_BASE_URL);

// Check if API key is provided
if (!hasLiveApiConfig) {
  console.warn('\x1b[33m%s\x1b[0m', '【警告】未在 .env 文件中检测到完整的视频 API 配置，系统将处于模拟模式！');
}

/**
 * 1. Check Credits Balance
 */
app.get('/api/credits', async (req, res) => {
  if (!hasLiveApiConfig) {
    return res.json({
      code: 200,
      data: { api_available_credits: 47995, api_total_credits: 51000 }
    });
  }

  try {
    const response = await axios.get(`${VIDEO_API_BASE_URL}/v1/credits`, {
      headers: { 'Authorization': `Bearer ${VIDEO_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('获取额度失败:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { message: 'Internal server error' });
  }
});

/**
 * 2. Get Task Status
 */
app.get('/api/task-status', async (req, res) => {
  const { task_id } = req.query;
  if (!task_id) {
    return res.status(400).json({ message: '缺少 task_id 参数' });
  }

  // Handle mock tasks
  if (task_id.startsWith('mock_')) {
    const createdTime = parseInt(task_id.split('_')[1]);
    const elapsed = Date.now() - createdTime;
    if (elapsed > 8000) {
      return res.json({
        code: 200,
        data: {
          task_id,
          status: 'succeeded',
          result: {
            video_url: 'https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-at-night-42289-large.mp4',
            error_message: null
          }
        }
      });
    } else {
      return res.json({
        code: 200,
        data: {
          task_id,
          status: 'running',
          result: null
        }
      });
    }
  }

  if (!hasLiveApiConfig) {
    return res.status(503).json({ message: '视频 API 未配置，无法查询真实任务状态' });
  }

  try {
    const response = await axios.get(`${VIDEO_API_BASE_URL}/v1/tasks?task_id=${task_id}`, {
      headers: { 'Authorization': `Bearer ${VIDEO_API_KEY}` }
    });
    res.json(response.data);
  } catch (error) {
    console.error('获取任务状态失败:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { message: 'Internal server error' });
  }
});

/**
 * 3. Submit Video Generation Task
 */
app.post('/api/generate-video', upload.single('image'), async (req, res) => {
  try {
    const { prompt, model, ratio, duration, function_mode } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: '请上传图片文件' });
    }

    // Determine the public URL of the uploaded image
    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${file.filename}`;
    
    console.log(`[File Uploaded] Stored locally: ${file.path}`);
    console.log(`[Image Public URL] ${imageUrl}`);

    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      console.warn('\x1b[36m%s\x1b[0m', `【提示】当前服务器运行于本地环境 (${host})。`);
      console.warn('\x1b[36m%s\x1b[0m', `由于视频接口是云端调用，本地局域网 URL (${imageUrl}) 对云端服务器不可达。`);
      console.warn('\x1b[36m%s\x1b[0m', `在未部署至公网或使用内网穿透时，本系统将自动采用模拟返回以供前台调试。`);
    }

    // If API Key is not set or running on localhost, run in mock mode to prevent API failures
    if (!hasLiveApiConfig || host.includes('localhost') || host.includes('127.0.0.1')) {
      console.log('【模拟模式】正在提交生成任务，提示词:', prompt);
      const mockTaskId = `mock_${Date.now()}`;
      return res.json({
        code: 200,
        data: {
          task_id: mockTaskId,
          status: 'running',
          credits_cost: model === 'seedance_2_0_fast' ? 8 : 12
        }
      });
    }

    // Post to video API
    const response = await axios.post(`${VIDEO_API_BASE_URL}/v1/video/seedance-2`, {
      model: model || 'seedance_2_0',
      prompt: prompt,
      function_mode: function_mode || 'omni_reference',
      ratio: ratio || '16:9',
      duration: parseInt(duration) || 5,
      image_urls: [imageUrl],
      audio_urls: [],
      video_urls: []
    }, {
      headers: {
        'Authorization': `Bearer ${VIDEO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);

  } catch (error) {
    console.error('提交生成任务失败:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`
  ==============================================================
   AI 智能图生视频工作台已启动
   本地服务及前端页面地址: http://localhost:${PORT}/
   API 状态: ${hasLiveApiConfig ? '已配置真实 Key (sk-...) ' : '未配置 (调试模拟模式) '}
  ==============================================================
  `);
});
