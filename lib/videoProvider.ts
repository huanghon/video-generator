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

function normalizeProviderMessage(message?: string | null) {
  if (!message) return '视频供应商请求失败';

  if (/insufficient credits/i.test(message)) {
    return '生成服务额度不足，请联系管理员处理';
  }

  if (/parallel task limit|concurrent task limit/i.test(message)) {
    return '当前生成队列繁忙，请稍后再试';
  }

  if (/authentication|unauthorized|invalid api key/i.test(message)) {
    return '生成服务配置异常，请联系管理员处理';
  }

  return message;
}

function getProviderError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | null; trace_id?: string | null } | undefined;
    const message = normalizeProviderMessage(data?.message || error.message);
    return data?.trace_id ? `${message} (trace_id: ${data.trace_id})` : message;
  }
  return error instanceof Error ? normalizeProviderMessage(error.message) : '视频供应商请求失败';
}

function assertSuccessfulProviderResponse(responseData: any) {
  if (typeof responseData?.code === 'number' && responseData.code !== 200) {
    throw new Error(normalizeProviderMessage(responseData.message || '视频供应商返回失败'));
  }
}

function buildCreatePayload(params: CreateSeedanceVideoTaskParams) {
  const functionMode = normalizeFunctionMode(params.functionMode);
  const imageUrls = params.imageUrls || [];

  return {
    model: normalizeModel(params.model),
    prompt: params.prompt,
    function_mode: functionMode,
    ratio: normalizeRatio(params.aspectRatio),
    duration: normalizeDuration(params.duration),
    image_urls: functionMode === 'first_last_frames' ? imageUrls.slice(0, 2) : imageUrls.slice(0, 9),
    audio_urls: (params.audioUrls || []).slice(0, 3),
    video_urls: (params.videoUrls || []).slice(0, 3)
  };
}

function getCreatedTaskId(responseData: any) {
  return responseData?.data?.task_id || responseData?.task_id;
}

function mapProviderTaskStatus(data: any): VideoTaskStatusResult['status'] {
  const status = String(data?.result?.status || data?.status || '').toLowerCase();

  if (
    ['success', 'succeeded', 'complete', 'completed', 'finished', 'done'].includes(status) ||
    (data?.result?.video_url && !data?.result?.error_message)
  ) {
    return 'success';
  }

  if (
    ['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(status) ||
    Boolean(data?.result?.error_message)
  ) {
    return 'failed';
  }

  return 'processing';
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
      buildCreatePayload(params),
      {
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    assertSuccessfulProviderResponse(response.data);

    const apiTaskId = getCreatedTaskId(response.data);
    if (!apiTaskId) {
      throw new Error(response.data?.message || '视频供应商未返回 task_id');
    }

    return {
      apiTaskId,
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
      prompt: params.prompt,
      model: params.model,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      functionMode: params.functionMode,
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
  credential: ApiKeyCredential,
  _options?: { taskType?: string | null }
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
        Authorization: `Bearer ${credential.apiKey}`,
        Accept: 'application/json'
      }
    });

    assertSuccessfulProviderResponse(response.data);

    const data = response.data?.data || response.data;
    const status = mapProviderTaskStatus(data);
    if (status === 'success') {
      return {
        status,
        videoUrl: data?.result?.video_url,
        rawResponse: response.data
      };
    }

    if (status === 'failed') {
      return {
        status,
        errorMessage: data?.result?.error_message || response.data?.message || '视频生成失败',
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
