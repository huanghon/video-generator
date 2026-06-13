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
const DEFAULT_IMAGE_PROVIDER_BASE_URL = 'https://loova.ai/loovaai-api';
const MOCK_VIDEO_URL =
  'https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-at-night-42289-large.mp4';
const SUPPORTED_MODELS = new Set(['seedance_2_0', 'seedance_2_0_fast']);
const SUPPORTED_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
const SUPPORTED_FUNCTION_MODES = new Set(['first_last_frames', 'omni_reference']);
const WEB_TASK_TYPES =
  't2v,i2v,tl2v,v2v,cs2v,ref2v,m2v,cc2v,k2v,h2v,v2v_remove_element,v2v_add_element,v2v_change_bg,v2v_add_effect,v2v_style_transfer,v2v_character_style,v2v_hair_style,v2v_angle_control,v2v_upscale,product_ads_generator,viral_ads_clone_video';

function shouldUseMock() {
  return process.env.VIDEO_PROVIDER_MOCK !== 'false';
}

function getProviderBaseUrl(credential: ApiKeyCredential, fallbackBaseUrl = DEFAULT_PROVIDER_BASE_URL) {
  const baseUrl = credential.baseUrl || process.env.VIDEO_PROVIDER_BASE_URL || fallbackBaseUrl;
  return baseUrl.replace(/\/$/, '');
}

function normalizeModel(model?: string | null) {
  return model && SUPPORTED_MODELS.has(model) ? model : 'seedance_2_0';
}

function normalizeWebModel(model?: string | null) {
  if (model === 'seedance_2_0_fast') return 'seedance2_0_fast';
  if (model === 'seedance_2_0') return 'seedance2_0';
  if (model === 'seedance2_0_fast' || model === 'seedance2_0') return model;
  return 'seedance2_0';
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

function createWebMedia(url: string, type: 'image' | 'video') {
  return {
    file_type: type,
    url,
    name: url,
    file_url: url,
    file_key: url,
    type,
    duration: 0,
    extra: {
      duration: 0,
      file_url: url,
      file_key: url,
      type
    }
  };
}

function findTaskRecord(value: unknown, taskId: string): any | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskRecord(item, taskId);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, any>;
  if (
    record.id === taskId ||
    record.task_id === taskId ||
    record.record_id === taskId ||
    record.task_record_id === taskId
  ) {
    return record;
  }

  for (const item of Object.values(record)) {
    const found = findTaskRecord(item, taskId);
    if (found) return found;
  }

  return null;
}

function findVideoUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, any>;
  const candidate =
    record.video_url ||
    record.videoUrl ||
    record.output_url ||
    record.outputUrl ||
    record.url ||
    record.file_url ||
    record.fileUrl;

  if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) {
    return candidate;
  }

  for (const item of Object.values(record)) {
    const found = findVideoUrl(item);
    if (found) return found;
  }

  return undefined;
}

function mapWebTaskStatus(record: any): VideoTaskStatusResult['status'] {
  const status = String(
    record?.status ||
      record?.task_status ||
      record?.state ||
      record?.generate_status ||
      record?.progress_status ||
      ''
  ).toLowerCase();

  if (
    ['success', 'succeeded', 'complete', 'completed', 'finished', 'done'].includes(status) ||
    Number(record?.status) === 2 ||
    Number(record?.task_status) === 2
  ) {
    return 'success';
  }

  if (
    ['failed', 'fail', 'error', 'canceled', 'cancelled'].includes(status) ||
    Number(record?.status) === 3 ||
    Number(record?.task_status) === 3
  ) {
    return 'failed';
  }

  return 'processing';
}

async function getWebTaskStatus(
  apiTaskId: string,
  credential: ApiKeyCredential
): Promise<VideoTaskStatusResult> {
  const response = await axios.get(
    `${getProviderBaseUrl(credential, DEFAULT_IMAGE_PROVIDER_BASE_URL)}/task_records/list_paged`,
    {
      params: {
        page_num: 1,
        page_size: 20,
        task_types: WEB_TASK_TYPES
      },
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
        Accept: 'application/json',
        'x-app-id': process.env.VIDEO_PROVIDER_APP_ID || '52000'
      }
    }
  );

  assertSuccessfulProviderResponse(response.data);

  const record = findTaskRecord(response.data, apiTaskId);
  if (!record) {
    return {
      status: 'processing',
      rawResponse: response.data
    };
  }

  const status = mapWebTaskStatus(record);
  if (status === 'success') {
    return {
      status,
      videoUrl: findVideoUrl(record),
      rawResponse: response.data
    };
  }

  if (status === 'failed') {
    return {
      status,
      errorMessage:
        record?.error_message ||
        record?.errorMessage ||
        record?.message ||
        record?.fail_reason ||
        '视频生成失败',
      rawResponse: response.data
    };
  }

  return {
    status: 'processing',
    rawResponse: response.data
  };
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

  if (shouldUseMock()) {
    return {
      apiTaskId: `mock_${Date.now()}`
    };
  }

  try {
    const mediaList = [
      ...imageUrls.map((url) => createWebMedia(url, 'image')),
      ...(params.videoUrls || []).map((url) => createWebMedia(url, 'video'))
    ];

    // TODO: The captured img2vid endpoint does not show audio reference handling;
    // keep audio files uploaded in the app, but do not submit them until verified.
    const response = await axios.post(
      `${getProviderBaseUrl(credential, DEFAULT_IMAGE_PROVIDER_BASE_URL)}/videos/img2vid`,
      {
        v_model: normalizeWebModel(params.model),
        out_number: 1,
        pay_type: 'credit',
        prompt: params.prompt,
        is_ref: true,
        image_keys: [],
        media_list: mediaList,
        video_keys: [],
        audio_keys: [],
        duration: normalizeDuration(params.duration),
        aspect_ratio: normalizeRatio(params.aspectRatio)
      },
      {
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-app-id': process.env.VIDEO_PROVIDER_APP_ID || '52000'
        }
      }
    );

    assertSuccessfulProviderResponse(response.data);

    const apiTaskId = response.data?.data?.task_id;
    if (!apiTaskId) {
      throw new Error('图生视频接口未返回 task_id');
    }

    return {
      apiTaskId,
      rawResponse: response.data
    };
  } catch (error) {
    throw new Error(getProviderError(error));
  }
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
  options?: { taskType?: string | null }
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
    if (
      options?.taskType === 'image-to-video' ||
      getProviderBaseUrl(credential).includes('loovaai-api')
    ) {
      return getWebTaskStatus(apiTaskId, credential);
    }

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
