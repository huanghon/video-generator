import axios from 'axios';
import { ApiKeyCredential } from '@/lib/apiKeyPool';

type CreateSeedanceVideoTaskParams = {
  prompt: string;
  model: string;
  aspectRatio?: string | null;
  duration?: number;
  functionMode?: string | null;
  imageUrls?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
};

type CreateVideoTaskResult = {
  apiTaskId: string;
  rawResponse?: unknown;
};

type VideoTaskStatusResult = {
  status: 'processing' | 'success' | 'failed';
  videoUrl?: string;
  errorMessage?: string;
  rawResponse?: unknown;
};

const DEFAULT_PROVIDER_BASE_URL = 'https://api.loova.ai/api';
const MOCK_VIDEO_URL =
  'https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-at-night-42289-large.mp4';
const SUPPORTED_MODELS = new Set(['seedance_2_0', 'seedance_2_0_fast']);
const SUPPORTED_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
const SUPPORTED_FUNCTION_MODES = new Set(['first_last_frames', 'omni_reference']);

function shouldUseMock() {
  return process.env.VIDEO_PROVIDER_MOCK !== 'false';
}

function getProviderBaseUrl(credential: ApiKeyCredential) {
  const baseUrl = credential.baseUrl || process.env.VIDEO_PROVIDER_BASE_URL || DEFAULT_PROVIDER_BASE_URL;
  return baseUrl.replace(/\/$/, '');
}

function normalizeModel(model?: string | null) {
  return model && SUPPORTED_MODELS.has(model) ? model : 'seedance_2_0';
}

function normalizeRatio(ratio?: string | null) {
  return ratio && SUPPORTED_RATIOS.has(ratio) ? ratio : '16:9';
}

function normalizeDuration(duration?: number) {
  if (!Number.isFinite(duration)) return 5;
  return Math.max(4, Math.min(15, Math.round(duration!)));
}

function normalizeFunctionMode(functionMode?: string | null) {
  return functionMode && SUPPORTED_FUNCTION_MODES.has(functionMode)
    ? functionMode
    : 'omni_reference';
}

function getProviderError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || error.message || '视频供应商请求失败';
  }
  return error instanceof Error ? error.message : '视频供应商请求失败';
}

function assertSuccessfulProviderResponse(responseData: any) {
  if (responseData?.code && responseData.code !== 200) {
    throw new Error(responseData.message || '视频供应商返回失败');
  }
}

async function createSeedanceVideoTask(
  params: CreateSeedanceVideoTaskParams,
  credential: ApiKeyCredential
): Promise<CreateVideoTaskResult> {
  if (shouldUseMock()) {
    return {
      apiTaskId: `mock_${Date.now()}`
    };
  }

  try {
    const response = await axios.post(
      `${getProviderBaseUrl(credential)}/v1/video/seedance-2`,
      {
        model: normalizeModel(params.model),
        prompt: params.prompt,
        function_mode: normalizeFunctionMode(params.functionMode),
        ratio: normalizeRatio(params.aspectRatio),
        duration: normalizeDuration(params.duration),
        image_urls: params.imageUrls || [],
        audio_urls: params.audioUrls || [],
        video_urls: params.videoUrls || []
      },
      {
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    assertSuccessfulProviderResponse(response.data);

    return {
      apiTaskId: response.data?.data?.task_id,
      rawResponse: response.data
    };
  } catch (error) {
    throw new Error(getProviderError(error));
  }
}

export async function createImageToVideoTask(
  params: Omit<CreateSeedanceVideoTaskParams, 'imageUrls'> & {
    imageUrl?: string | null;
    imageUrls?: string[];
  },
  credential: ApiKeyCredential
): Promise<CreateVideoTaskResult> {
  const imageUrls = params.imageUrls?.length
    ? params.imageUrls
    : params.imageUrl
      ? [params.imageUrl]
      : [];

  return createSeedanceVideoTask(
    {
      ...params,
      imageUrls,
      audioUrls: params.audioUrls || [],
      videoUrls: params.videoUrls || []
    },
    credential
  );
}

export async function createTextToVideoTask(
  params: Omit<CreateSeedanceVideoTaskParams, 'imageUrls' | 'audioUrls' | 'videoUrls'>,
  credential: ApiKeyCredential
): Promise<CreateVideoTaskResult> {
  return createSeedanceVideoTask(
    {
      ...params,
      imageUrls: [],
      audioUrls: [],
      videoUrls: []
    },
    credential
  );
}

export async function getVideoTaskStatus(
  apiTaskId: string,
  credential: ApiKeyCredential
): Promise<VideoTaskStatusResult> {
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

  try {
    const response = await axios.get(`${getProviderBaseUrl(credential)}/v1/tasks`, {
      params: { task_id: apiTaskId },
      headers: {
        Authorization: `Bearer ${credential.apiKey}`
      }
    });

    assertSuccessfulProviderResponse(response.data);

    const data = response.data?.data || response.data;
    if (data?.status === 'succeeded' || data?.status === 'success') {
      return {
        status: 'success',
        videoUrl: data?.result?.video_url || data?.video_url,
        rawResponse: response.data
      };
    }
    if (data?.status === 'failed') {
      return {
        status: 'failed',
        errorMessage: data?.result?.error_message || data?.error_message || response.data?.message || '视频生成失败',
        rawResponse: response.data
      };
    }
    return {
      status: 'processing',
      rawResponse: response.data
    };
  } catch (error) {
    throw new Error(getProviderError(error));
  }
}
