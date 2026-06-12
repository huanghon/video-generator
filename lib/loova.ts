import axios from 'axios';

type CreateImageToVideoTaskParams = {
  prompt: string;
  imageUrl?: string | null;
  model: string;
  aspectRatio?: string | null;
  duration?: number;
};

type CreateImageToVideoTaskResult = {
  apiTaskId: string;
};

type VideoTaskStatusResult = {
  status: 'processing' | 'success' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
};

const MOCK_VIDEO_URL =
  'https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-at-night-42289-large.mp4';

function shouldUseMock() {
  return (
    process.env.LOOVA_API_MOCK !== 'false' ||
    !process.env.LOOVA_API_KEY ||
    !process.env.LOOVA_API_BASE_URL
  );
}

export async function createImageToVideoTask(
  params: CreateImageToVideoTaskParams
): Promise<CreateImageToVideoTaskResult> {
  if (shouldUseMock()) {
    return {
      apiTaskId: `mock_${Date.now()}`
    };
  }

  // TODO: Replace this payload with the official Loova image-to-video request schema.
  const response = await axios.post(
    `${process.env.LOOVA_API_BASE_URL}/v1/video/seedance-2`,
    {
      model: params.model,
      prompt: params.prompt,
      ratio: params.aspectRatio || '16:9',
      duration: params.duration || 5,
      image_urls: params.imageUrl ? [params.imageUrl] : []
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.LOOVA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    apiTaskId: response.data?.data?.task_id || response.data?.task_id
  };
}

export async function getVideoTaskStatus(apiTaskId: string): Promise<VideoTaskStatusResult> {
  if (apiTaskId.startsWith('mock_') || shouldUseMock()) {
    const createdAt = Number(apiTaskId.split('_')[1] || Date.now());
    if (Date.now() - createdAt > 8000) {
      return {
        status: 'success',
        videoUrl: MOCK_VIDEO_URL
      };
    }
    return { status: 'processing' };
  }

  // TODO: Replace this response mapping with the official Loova task status schema.
  const response = await axios.get(`${process.env.LOOVA_API_BASE_URL}/v1/tasks`, {
    params: { task_id: apiTaskId },
    headers: {
      Authorization: `Bearer ${process.env.LOOVA_API_KEY}`
    }
  });

  const data = response.data?.data || response.data;
  if (data?.status === 'succeeded' || data?.status === 'success') {
    return {
      status: 'success',
      videoUrl: data?.result?.video_url || data?.video_url
    };
  }
  if (data?.status === 'failed') {
    return {
      status: 'failed',
      errorMessage: data?.result?.error_message || data?.error_message || '视频生成失败'
    };
  }
  return { status: 'processing' };
}
